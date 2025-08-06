import * as usbmux from '@irdk/usbmux'
import logger from '../../util/logger.js'

const log = logger.createLogger('ios:redirect-ports')

/**
 * Open ports from an iOS device to a host.
 * Currently works only for unix based systems
 *
 * @param {number} devicePort port on the iOS device
 * @param {number} listenPort port on host
 * @param {string} udid device UDID to relay to
 * @param {string} usbmuxPath path to usbmux sock file
 * @returns {Promise<function(): Promise<void>>} A promise which resolves when the ports are forwarded. Returns stop callback
 */
export async function openPort(devicePort, listenPort, udid, usbmuxPath) {
    usbmux.address.path = usbmuxPath
    let relay = new usbmux.Relay(devicePort, listenPort, {
        udid: udid
    })

    await new Promise((resolve, reject) => {
        relay.on('ready', (...args) => {
            relay.removeListener('error', reject)
            resolve(args)
        })
        relay.on('error', reject)
    })

    return () => {
        return new Promise((resolve, reject) => {
            relay.on('close', () => {
                relay.removeListener('error', reject)
                resolve()
            })
            relay.on('error', reject)
            relay.stop()
        })
    }
}
