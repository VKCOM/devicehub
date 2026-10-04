import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import router from './router.js'
import wireutil from '../../../wire/util.js'
import {resolveAdbPort} from './processor-config.js'
import transport from './transport.js'
import {
    ConnectGetForwardUrlMessage,
    ConnectStartedMessage,
    ConnectStartMessage,
    ConnectStopMessage,
    ConnectStoppedMessage
} from '../../../wire/wire.js'

/**
 * @typedef {{
 *     serial: string
 *     deviceType: DEVICE_TYPE[string]
 *     storageUrl?: string
 *     urlWithoutAdbPort?: boolean
 *     handlers: {
 *         start: () => Promise<any> | any
 *         stop: () => Promise<any> | any
 *     }
 * }} ConnectorInitOptions
 *
 * @typedef {{
 *     started: boolean
 *     init: (opt: ConnectorInitOptions) => void
 *  }} ConnectorPlugin
 * */

export const DEVICE_TYPE = {
    ANDROID: 0,
    IOS: 1,
    TIZEN: 2
}

export default syrup.serial()
    .dependency(router)
    .dependency(transport)
    .define(async(options, router, transport) => {
        const log = logger.createLogger('device:support:connector')
        return /** @type {ConnectorPlugin} */ new (class {
            started = false
            handlers
            url
            pending = Promise.resolve()

            /** @param {ConnectorInitOptions} opt*/
            init({handlers, serial, storageUrl, deviceType, urlWithoutAdbPort}) {
                this.handlers = handlers
                this.serial = serial
                this.reply = wireutil.reply(serial)
                this.storageUrl = storageUrl
                this.deviceType = deviceType
                this.deviceTypeName = Object.keys(DEVICE_TYPE)[this.deviceType]
                this.urlWithoutAdbPort = urlWithoutAdbPort

                router
                    .on(ConnectStartMessage,
                        (channel) => this.start(channel)
                    )
                    .on(ConnectGetForwardUrlMessage,
                        (channel) => this.getUrl(channel)
                    )
                    .on(ConnectStopMessage,
                        (channel) => this.stop(channel)
                    )
            }

            getUrl = async(channel) => {
                if (this.started && this.url) {
                    transport.send([
                        channel, this.reply?.okay(this.url)
                    ])
                    return
                }

                return this.start(channel)
            }

            start = (channel) => {
                const task = this.pending.then(() => this.startNow(channel))
                this.pending = task.catch(() => {})
                return task
            }

            startNow = async(channel) => {
                try {
                    if (options.silent && this.started) {
                        if (channel) {
                            transport.send([channel, this.reply?.okay(this.url)])
                        }

                        return
                    }
                    if (this.started) {
                        await this.handlers.stop()
                    }
                    this.url = await this.handlers.start()
                    if (options.silent && !this.url) {
                        this.url = `${options.publicIp}:${options.connectPort}`
                    }

                    if (!options.silent && !options.connectUrlPattern && this.deviceType === DEVICE_TYPE.ANDROID) {
                        const adbPort = await resolveAdbPort(transport)
                        if (adbPort && this.storageUrl) {
                            const baseUrl = this.storageUrl.split('/')[2]?.split(':')
                            this.url = baseUrl[0] + ':' + adbPort.toString()
                        }
                        else if (!this.urlWithoutAdbPort) {
                            this.url = 'unavailable. Contact administrator'
                        }
                    }

                    if (!this.url) {
                        throw new Error('Remote connect URL is not configured')
                    }

                    if (channel) {
                        transport.send([channel, this.reply?.okay(this.url)])
                    }

                    // State events are separate from the transaction reply.
                    transport.send([
                        wireutil.global,
                        wireutil.pack(ConnectStartedMessage, {serial: this.serial, url: this.url})
                    ])

                    this.started = true
                    log.important('Remote Connect Started for %s device "%s" at "%s"', this.deviceTypeName, this.serial, this.url)
                }
                catch (e) {
                    log.error('Remote Connect for %s device "%s" failed with error: %s', this.deviceTypeName, this.serial, e)
                    await Promise.resolve().then(() => this.handlers.stop()).catch(() => {})
                    this.started = false
                    if (!channel) {
                        throw e
                    }

                    transport.send([channel, this.reply?.fail(e?.message || String(e))])
                }
            }

            stop = (channel) => {
                const task = this.pending.then(() => this.stopNow(channel))
                this.pending = task.catch(() => {})
                return task
            }

            stopNow = async(channel) => {
                try {
                    await this.handlers.stop()
                    this.started = false

                    if (channel) {
                        transport.send([channel, this.reply?.okay()])
                    }

                    // State events are separate from the transaction reply.
                    transport.send([
                        wireutil.global,
                        wireutil.pack(ConnectStoppedMessage, {serial: this.serial})
                    ])

                    log.important('Remote Connect Stopped for device "%s"', this.serial)
                }
                catch (/** @type {any} */e) {
                    log.important('Remote Connect Stopping for device "%s" failed: %s', this.serial, e)
                    if (!channel) {
                        throw e
                    }

                    transport.send([channel, this.reply?.fail(e?.message || String(e))])
                }
            }
        })()
    })
