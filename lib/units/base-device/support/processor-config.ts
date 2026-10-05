import {randomUUID} from 'node:crypto'
import {Any} from '../../../wire/google/protobuf/any.js'
import {Envelope, ResolveAdbPortRequest, ResolveAdbPortResponse} from '../../../wire/wire.js'
import wireutil from '../../../wire/util.js'
import type {DeviceTransport} from '../../../wire/device-transport.js'

/** One bounded request over the worker's existing connection; no Mongo dependency. */
export function resolveAdbPort(transport: DeviceTransport, timeout = 10_000): Promise<number | undefined> {
    const requestId = randomUUID()
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timer)
            transport.off('message', onMessage)
            transport.off('close', onClose)
        }

        const onClose = () => {
            cleanup()
            reject(new Error('Device transport closed'))
        }

        const onMessage = (_channel: string, bytes: Buffer) => {
            const envelope = Envelope.fromBinary(bytes)
            if (!envelope.message || !Any.contains(envelope.message, ResolveAdbPortResponse)) {
                return
            }

            const response = Any.unpack(envelope.message, ResolveAdbPortResponse)
            if (response.requestId !== requestId) {
                return
            }

            cleanup()
            if (response.error) {
                reject(new Error(response.error))
            } else {
                resolve(response.adbPort)
            }
        }

        const timer = setTimeout(() => {
            cleanup()
            reject(new Error('Timed out resolving remote ADB port'))
        }, timeout)

        transport.on('message', onMessage)
        transport.once('close', onClose)
        transport.send([wireutil.global, wireutil.pack(ResolveAdbPortRequest, {requestId})])
    })
}
