import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import router from './router.js'
import wire from '../../../wire/index.js'
import dbapi from '../../../db/api.js'
import wireutil from '../../../wire/util.js'
import db from '../../../db/index.js'
import push from './push.js'

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
    .dependency(push)
    .define(async(options, router, push) => {
        const log = logger.createLogger('device:support:connector')
        return /** @type {ConnectorPlugin} */ new (class {
            started = false
            handlers
            url

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
                    .on(wire.ConnectStartMessage,
                        (channel) => this.start(channel)
                    )
                    .on(wire.ConnectGetForwardUrlMessage,
                        (channel) => this.getUrl(channel)
                    )
                    .on(wire.ConnectStopMessage,
                        (channel) => this.stop(channel)
                    )
            }

            getUrl = async(channel) => {
                if (this.started && this.url) {
                    push.send([
                        channel, this.reply?.okay(this.url)
                    ])
                    return
                }

                return this.start(channel)
            }

            start = async(channel) => {
                try {
                    if (this.started) {
                        await this.handlers.stop()
                    }
                    this.url = await this.handlers.start()

                    if (this.deviceType === DEVICE_TYPE.ANDROID) {
                        await db.connect() // TODO: remove db connect
                        const device = await dbapi.loadDeviceBySerial(this.serial)
                        if (device.adbPort && this.storageUrl) {
                            const baseUrl = this.storageUrl.split('/')[2]?.split(':')
                            this.url = baseUrl[0] + ':' + device.adbPort.toString()
                        }
                        else if (!this.urlWithoutAdbPort) {
                            this.url = 'unavailable. Contact administrator'
                        }
                    }

                    push.send([
                        channel, this.reply?.okay(this.url)
                    ])

                    // Update DB
                    push.send([
                        channel,
                        wireutil.envelope(new wire.ConnectStartedMessage(
                            this.serial, this.url
                        ))
                    ])

                    this.started = true
                    log.important('Remote Connect Started for %s device "%s" at "%s"', this.deviceTypeName, this.serial, this.url)
                }
                catch (e) {
                    log.error('Remote Connect for %s device "%s" failed with error: %s', this.deviceTypeName, this.serial, e)
                }
            }

            stop = async(channel) => {
                try {
                    await this.handlers.stop()
                    this.started = false

                    push.send([
                        channel,
                        this.reply?.okay()
                    ])

                    // Update DB
                    push.send([
                        channel,
                        wireutil.envelope(new wire.ConnectStoppedMessage(this.serial))
                    ])

                    log.important('Remote Connect Stopped for device "%s"', this.serial)
                }
                catch (/** @type {any} */e) {
                    log.important('Remote Connect Stopping for device "%s" failed: %s', this.serial, e)
                    push.send([
                        channel,
                        this.reply?.fail(e?.message || e)
                    ])
                }
            }
        })()
    })
