import {v4 as uuidv4} from 'uuid'
import {MessageType} from '@protobuf-ts/runtime'
import * as Sentry from '@sentry/node'
import apiutil from '../util/apiutil.js'
import {WireRouter} from './router.js'
import {TransactionDoneMessage, TransactionProgressMessage, Envelope} from './wire.js'
import {Any} from './google/protobuf/any.js'
import {CORRELATION_PREFIX} from './frame.js'
import type {AppTransport} from './app-transport.js'

// The one Envelope encoder transmanager needs (channel-in-slot for reply
// correlation); inlined to avoid importing the whole wireutil object.
const tr = <T extends object>(channel: string, messageType: MessageType<T>, message: T): Uint8Array =>
    Envelope.toBinary({message: Any.pack(message, messageType), channel})

const sentryTransactionSpan = <T = Promise<any>>(target: string, message: any, timeout: number, cb: () => T): T =>
    Sentry.startSpan({
        op: 'wireTransaction',
        name: message?.$code,
        attributes: {message, target, timeout},
        forceTransaction: true,
    }, cb)

const sentryCaptureTimeout = (target: string, message: any, timeout: number) => {
    Sentry.addBreadcrumb({
        data: {target, message, timeout},
        message: 'Transaction context',
        level: 'warning',
        type: 'default',
    })
    Sentry.captureMessage('Timeout when running transaction')
}

// The value a transaction settles with: the reply's success flag, its `data`
// scalar (e.g. a connect url / install result string) and its parsed JSON
// `body` (an object, or {} when absent).
export interface TransactionResult {
    success: boolean
    data?: string
    body: any
}

// A progress callback fires for every TransactionProgressMessage a device
// streams before the final done (shell output chunks, install progress). `data`
// is the chunk/status, `progress` a 0..100 percentage, `seq` its order.
export type ProgressCallback = (data: string | undefined, progress: number | undefined, seq: number) => void

interface PendingTransaction {
    resolve: (result: TransactionResult) => void
    reject: (result: TransactionResult) => void
    timer: ReturnType<typeof setTimeout>
    onProgress?: ProgressCallback
}

// Owns request/reply over a single app-side AppTransport (DEALER to the proxy).
//
// A device command is addressed by (providerName, serial): the AppTransport
// encodes it as a [D, providerName, serial, envelope] frame and the proxy
// forwards it to the processor owning that provider. A correlationId
// (`txn_<uuid>`) is minted per transaction and carried in the Envelope.channel
// slot. It is used ONLY to match a reply back to its pending promise — NOT for
// routing (routing is done by the frame-protocol reply-path). One shared
// handler on the transport dispatches every reply (delivered as the transport's
// 'message' event with channel = Envelope.channel) to the correct pending
// entry, instead of attaching a listener per transaction.
export class TransactionManager {
    private pending = new Map<string, PendingTransaction>()

    constructor(private transport: AppTransport) {
        const router = new WireRouter()
            .on(TransactionProgressMessage, (correlationId: string, message: any) => {
                this.pending.get(correlationId)?.onProgress?.(
                    message.data, message.progress, message.seq
                )
            })
            .on(TransactionDoneMessage, (correlationId: string, message: any) => {
                this.settle(correlationId, message)
            })
            .handler()

        // AppTransport emits 'message' (channel, body) for a reply (R); channel
        // is the Envelope.channel (the correlationId), which WireRouter also
        // reads, so this is the single reply dispatch point.
        this.transport.on('message', router)
    }

    private settle(correlationId: string, message: any) {
        const entry = this.pending.get(correlationId)
        if (!entry) {
            return
        }
        clearTimeout(entry.timer)
        this.pending.delete(correlationId)

        // A TransactionDoneMessage carries two payload channels: `data` (a short
        // scalar — e.g. a connect url or install result string) and `body` (an
        // optional JSON blob). Surface both, plus `success`, so callers can pick
        // whichever their transaction produces.
        const result = {
            success: message.success,
            data: message.data,
            body: message.body ? JSON.parse(message.body) : {},
        }
        if (message.success) {
            entry.resolve(result)
        }
        else {
            entry.reject(result)
        }
    }

    runTransaction<T extends object>(
        providerName: string,
        serial: string,
        messageType: MessageType<T>,
        message: T,
        {timeout = apiutil.GRPC_WAIT_TIMEOUT, onProgress}: {timeout?: number; onProgress?: ProgressCallback} = {}
    ): Promise<TransactionResult> {
        const target = providerName + '/' + serial
        return sentryTransactionSpan(target, message, timeout, () => {
            const correlationId = CORRELATION_PREFIX + uuidv4()

            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    this.pending.delete(correlationId)
                    sentryCaptureTimeout(target, message, timeout)
                    reject(new Error('Timeout when running transaction'))
                }, timeout)

                this.pending.set(correlationId, {resolve, reject, timer, onProgress})

                // The Envelope carries the correlationId in its channel slot;
                // AppTransport encodes it as a device-directed frame.
                this.transport.sendCommand(
                    providerName,
                    serial,
                    tr(correlationId, messageType, message)
                )
            })
        })
    }
}

