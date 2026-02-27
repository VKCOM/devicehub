import * as usbmux from '@irdk/usbmux'
import logger from '../../util/logger.js'

const log = logger.createLogger('ios:redirect-ports')

/**
 * Open ports from an iOS device to a host.
 * Currently, works only for unix based systems.
 * Returns stop function.
 */
export async function openPort(
    devicePort: number,
    listenPort: number,
    udid: string,
    usbmuxPath: string
): Promise<() => Promise<void>> {
    usbmux.address.path = usbmuxPath
    const relay = new usbmux.Relay(devicePort, listenPort, {
        udid: udid
    })

    await new Promise<unknown>((resolve, reject) => {
        relay.on('ready', (...args: unknown[]) => {
            relay.removeListener('error', reject)
            resolve(args)
        })
        relay.on('error', reject)
    })

    return () =>
        new Promise<void>((resolve, reject) => {
            relay.on('close', () => {
                relay.removeListener('error', reject)
                resolve()
            })
            relay.on('error', reject)
            relay.stop()
        })
}


