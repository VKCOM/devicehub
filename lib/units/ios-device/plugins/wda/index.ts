import logger from '../../../../util/logger.js'
import syrup from '@devicefarmer/stf-syrup'
import {WireRouter} from '../../../../wire/router.js'
import wireutil from '../../../../wire/util.js'
import * as iosutil from '../util/iosutil.js'
import push from '../../../base-device/support/push.js'
import sub from '../../../base-device/support/sub.js'
import wdaClient from './client.js'
import {Esp32Touch} from '../touch/esp32touch.js'
import {
    BrowserOpenMessage,
    CapabilitiesMessage,
    DashboardOpenMessage,
    KeyDownMessage,
    KeyPressMessage,
    PhysicalIdentifyMessage,
    RotateMessage, RotationEvent,
    ScreenCaptureMessage,
    StoreOpenMessage,
    TapDeviceTreeElement,
    TouchDownMessage,
    TouchMoveMessage,
    TouchUpMessage,
    TypeMessage
} from '../../../../wire/wire.js'
import {Readable} from 'stream'
import storage from '../../../base-device/support/storage.js'

export default syrup.serial()
    .dependency(push)
    .dependency(sub)
    .dependency(wdaClient)
    .dependency(storage)
    .define((options, push, sub, wdaClient, storage) => {
        const log = logger.createLogger('wda:index')

        let cursorDevice: Esp32Touch | null = null
        let cursorIsPaired = false

        if (options.esp32Path) {
            cursorDevice = new Esp32Touch(options.deviceInfo.screenSize.width, options.deviceInfo.screenSize.height, options.esp32Path)

            cursorDevice.on('paired', () => {
                cursorIsPaired = true
                push.send([
                    wireutil.global,
                    wireutil.pack(CapabilitiesMessage, {
                        serial: options.serial,
                        hasTouch: true,
                        hasCursor: true
                    })
                ])
            })

            cursorDevice.on('disconnected', () => {
                cursorIsPaired = false
                cursorDevice?.reboot()
                push.send([
                    wireutil.global,
                    wireutil.pack(CapabilitiesMessage, {
                        serial: options.serial,
                        hasTouch: true,
                        hasCursor: false
                    })
                ])
            })

            cursorDevice.on('ready', () => {
                cursorDevice?.setName(options.deviceName)
            })
        }

        const router = new WireRouter()
            .on(KeyPressMessage, async(channel, message) => {
                if (wdaClient.orientation === 'LANDSCAPE' && message.key === 'home') {
                    await wdaClient.rotation('PORTRAIT')
                    await wdaClient.pressButton(message.key)
                    return
                }

                wdaClient.pressButton(message.key)
            })
            .on(StoreOpenMessage, (channel, message) => {
                wdaClient.pressButton('store')
            })
            .on(DashboardOpenMessage, (channel, message) => {
                wdaClient.pressButton('settings')
            })
            .on(PhysicalIdentifyMessage, (channel, message) => {
                wdaClient.pressButton('finder')
            })
            .on(TouchDownMessage, (channel, message) => {
                if(cursorIsPaired) {
                    cursorDevice!.press()
                    return
                }

                wdaClient.touchDown(message)
            })
            .on(TouchMoveMessage, (channel, message) => {
                if(cursorIsPaired) {
                    cursorDevice!.move(message.x, message.y)
                    return
                }

                wdaClient.touchMove(message)
            })
            .on(TouchUpMessage, (channel, message) => {
                if(cursorIsPaired) {
                    cursorDevice!.release()
                    return
                }

                wdaClient.touchUp()
            })
            .on(TapDeviceTreeElement, (channel, message) => {
                wdaClient.tapDeviceTreeElement(message.label)
            })
            .on(TypeMessage, (channel, message) => {
                if (!message.text) {
                    return
                }

                const key = iosutil.asciiparser(message.text)
                if (key) {
                    wdaClient.typeKey(key)
                }
            })
            .on(KeyDownMessage, (channel, message) => {
                if (message.key === 'home') {
                    wdaClient.homeBtn()
                    return
                }

                const key = iosutil.asciiparser(message.key)
                if (key) {
                    wdaClient.typeKey(key)
                }
            })
            .on(BrowserOpenMessage, (channel, message) => {
                wdaClient.openUrl(message.url)
            })
            .on(RotateMessage, async(channel, message) => {
                const orientation = iosutil.degreesToOrientation(message.rotation)
                await wdaClient.rotation(orientation)

                push.send([
                    wireutil.global,
                    wireutil.pack(RotationEvent, {
                        serial: options.serial,
                        rotation: message.rotation
                    })
                ])
            })
            .on(ScreenCaptureMessage, async(channel, message) => {
                try {
                    const response = await wdaClient.screenshot()
                    const imageBuffer = Buffer.from(response.value, 'base64')

                    const transfer = Readable.from(imageBuffer)

                    storage.store('blob', transfer, {
                        filename: `${Date.now()}_${options.serial}_screenshot.png`,
                        contentType: 'image/png',
                        knownLength: imageBuffer.length,
                        jwt: message.jwt
                    })
                } catch (err: any) {
                    log.error('iOS ScreenCaptureMessage error: %s', err?.message)
                }
            })
            .handler()

        wdaClient.on('connected', () => {
            sub.on('message', router)
        })

        wdaClient.on('disconnected', () => {
            sub.removeListener('message', router)
        })

        push.send([
            wireutil.global,
            wireutil.pack(CapabilitiesMessage, {
                serial: options.serial,
                hasTouch: true,
                hasCursor: false
            })
        ])
    })
