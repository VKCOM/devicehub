import * as usbmux from '@irdk/usbmux'


/**
 * Open ports from an iOS device to a host
 *
 * @param {number} devicePort port on the iOS device
 * @param {number} listenPort port on host
 * @param {string} udid device UDID to relay to
 * @returns {Promise<function(): Promise<void>>} A promise which resolves when the ports are forwarded. Returns stop callback
 */
export async function openPort(devicePort, listenPort, udid) {
    const relay = new usbmux.Relay(devicePort, listenPort, {
        udid: udid
    })

    await new Promise((resolve, reject) => {
        relay.on('ready', resolve)
        relay.on('error', reject)
    })

    return () => new Promise((resolve, reject) => {
        relay.on('close', resolve)
        relay.on('error', reject)
        relay.stop()
    })
}
