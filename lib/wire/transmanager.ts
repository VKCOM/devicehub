import {v4 as uuidv4} from 'uuid'
import apiutil from '../util/apiutil.js'
import {TransactionDoneMessage} from './wire.js'
import {WireRouter} from './router.js'
import * as Sentry from '@sentry/node'
import wireutil from './util.js'
import type {SocketWrapper} from '../util/zmqutil.js'
import EventEmitter from 'events'
import {MessageType} from '@protobuf-ts/runtime'

const sentryTransactionSpan = <T = Promise<any>>(channel: string, message: any, timeout: number, cb: () => T): T =>
    Sentry.startSpan({
        op: 'wireTransaction',
        name: message.$code,
        attributes: {
            message,
            channel,
            timeout
        },
        forceTransaction: true,
    }, cb)

const sentryCaptureTimeout = (channel: string, message: any, timeout: number) => {
    Sentry.addBreadcrumb({
        data: {channel, message, timeout},
        message: 'Transaction context',
        level: 'warning',
        type: 'default'
    })
    Sentry.captureMessage('Timeout when running transaction')
}

interface TransactionTransportOptions {
    sub: SocketWrapper
    push: SocketWrapper
    channelRouter: EventEmitter
    timeout?: number
}

export const runTransaction = <T extends object>(channel: string, messageType: MessageType<T>, message: T, {sub, push, channelRouter, timeout = apiutil.GRPC_WAIT_TIMEOUT}: TransactionTransportOptions) =>
    sentryTransactionSpan(
        channel,
        message,
        timeout,
        () => {
            const responseChannel = 'txn_' + uuidv4()
            sub.subscribe(responseChannel)
            return new Promise((resolve, reject) => {
                const messageListener = new WireRouter()
                    .on(TransactionDoneMessage, (channel: string, message: any) => {
                        clearTimeout(trTimeout)
                        sub.unsubscribe(responseChannel)
                        channelRouter.removeListener(responseChannel, messageListener)
                        if (message.success) {
                            resolve(message)
                        }
                        else {
                            reject(message)
                        }
                    })
                    .handler()

                const trTimeout = setTimeout(function() {
                    channelRouter.removeListener(responseChannel, messageListener)
                    sub.unsubscribe(responseChannel)

                    sentryCaptureTimeout(channel, message, timeout)
                    reject(new Error('Timeout when running transaction'))
                }, timeout)

                channelRouter.on(responseChannel, messageListener)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, messageType, message)
                ])
            })
        }
    )

type TransactionDevTransportOptions = Omit<TransactionTransportOptions, 'channelRouter'> & {
    router: WireRouter
}

export const runTransactionDev = <T extends object>(channel: string, messageType: MessageType<T>, message: T, {sub, push, router, timeout = apiutil.GRPC_WAIT_TIMEOUT}: TransactionDevTransportOptions): Promise<any> =>
    sentryTransactionSpan(
        channel,
        message,
        timeout,
        () => {
            const responseChannel = 'txn_' + uuidv4()
            sub.subscribe(responseChannel)
            return new Promise((resolve, reject) => {
                const messageListener = (channel: string, message: any) => {
                    clearTimeout(trTimeout)
                    sub.unsubscribe(responseChannel)
                    router.removeListener(TransactionDoneMessage, messageListener)

                    const body = message.body ? JSON.parse(message.body) : {}
                    if (message.success) {
                        resolve(body)
                    }
                    else {
                        reject(body)
                    }
                }
                router.on(TransactionDoneMessage, messageListener)

                const trTimeout = setTimeout(() => {
                    router.removeListener(TransactionDoneMessage, messageListener)
                    sub.unsubscribe(responseChannel)

                    sentryCaptureTimeout(channel, message, timeout)
                    reject(new Error('Timeout when running transaction'))
                }, timeout)

                push.send([
                    channel,
                    wireutil.tr(responseChannel, messageType, message)
                ])
            })
        }
    )
