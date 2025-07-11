import logger from '../../../util/logger.js'
import Promise from 'bluebird'
import request from 'postman-request'
import url from 'url'
import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
import wire from '../../../wire/index.js'
import {WireRouter} from '../../../wire/router.js'
import wireutil from '../../../wire/util.js'
import * as iosutil from './util/iosutil.js'
import push from '../../base-device/support/push.js'
import sub from '../../base-device/support/sub.js'
import wdaClient from './wda/WdaClient.js'
import {Esp32Touch} from './touch/esp32touch.js'
import info from './info/index.js'
export default syrup.serial()
    .dependency(push)
    .dependency(sub)
    .dependency(wdaClient)
    .dependency(info)
    .define((options, push, sub, wdaClient, info) => {
        const log = logger.createLogger('wda:client')
        const Wda = {}

        /**
         * @type {Esp32Touch | null}
         */
        let cursorDevice = null
        if (options.esp32Path) {
            cursorDevice = new Esp32Touch(options.deviceInfo.screenSize.width, options.deviceInfo.screenSize.height, options.esp32Path)
            cursorDevice.on('paired', () => {
                push.send([
                    wireutil.global,
                    wireutil.envelope(new wire.CapabilitiesMessage(options.serial, true, true))
                ])
            })
            cursorDevice.on('disconnected', () => {
                cursorDevice?.reboot()
                push.send([
                    wireutil.global,
                    wireutil.envelope(new wire.CapabilitiesMessage(options.serial, true, false))
                ])
            })
            cursorDevice.on('ready', () => {
                cursorDevice?.setName(options.deviceName)
            })
        }
        Wda.connect = () => {
            sub.on('message', new WireRouter()
                .on(wire.KeyPressMessage, (channel, message) => {
                    if (wdaClient.orientation === 'LANDSCAPE' && message.key === 'home') {
                        wdaClient.rotation({orientation: 'PORTRAIT'})
                            .then(() => {
                                try {
                                    wdaClient.pressButton(message.key)
                                }
                                catch (err) {
                                    log.error('Error while pressing button ', err)
                                }
                            })
                            .catch(err => {
                                log.error('Failed to rotate device ', err)
                            })
                    }
                    else {
                        try {
                            wdaClient.pressButton(message.key)
                        }
                        catch (err) {
                            log.error('Error while pressing button ', err)
                        }
                    }
                })
                .on(wire.StoreOpenMessage, (channel, message) => {
                    wdaClient.pressButton('store')
                })
                .on(wire.DashboardOpenMessage, (channel, message) => {
                    wdaClient.pressButton('settings')
                })
                .on(wire.PhysicalIdentifyMessage, (channel, message) => {
                    wdaClient.pressButton('finder')
                })
                .on(wire.TouchDownMessage, (channel, message) => {
                    if(cursorDevice?.state === 'paired') {
                        cursorDevice.press()
                    }
                    else {
                        wdaClient.tap(message)
                    }
                })
                .on(wire.TouchMoveIosMessage, (channel, message) => {
                    if(cursorDevice?.state !== 'paired') {
                        wdaClient.swipe(message)
                    }
                })
                .on(wire.TouchMoveMessage, (channel, message) => {
                    if(cursorDevice?.state === 'paired') {
                        cursorDevice.move(message.x, message.y)
                    }
                })
                .on(wire.TouchUpMessage, (channel, message) => {
                    if(cursorDevice?.state === 'paired') {
                        cursorDevice.release()
                    }
                    else {
                        wdaClient.touchUp()
                    }
                })
                .on(wire.TapDeviceTreeElement, (channel, message) => {
                    wdaClient.tapDeviceTreeElement(message)
                })
                .on(wire.TypeMessage, (channel, message) => {
                    log.verbose('wire.TypeMessage: ', message)
                    wdaClient.typeKey({value: [iosutil.asciiparser(message.text)]})
                })
                .on(wire.KeyDownMessage, (channel, message) => {
                    log.verbose('wire.KeyDownMessage: ', message)
                    if (message.key === 'home') {
                        wdaClient.homeBtn()
                    }
                    else {
                        wdaClient.typeKey({value: [iosutil.asciiparser(message.key)]})
                    }
                })
                .on(wire.BrowserOpenMessage, (channel, message) => {
                    wdaClient.openUrl(message)
                })
                .on(wire.RotateMessage, (channel, message) => {
                    if (wdaClient.isRotating) {
                        return
                    }
                    const rotation = iosutil.degreesToOrientation(message.rotation)
                    wdaClient.rotation({orientation: rotation})
                        .then(() => {
                            push.send([
                                wireutil.global,
                                wireutil.envelope(new wire.RotationEvent(options.serial, message.rotation))
                            ])
                        })
                        .catch(err => {
                            log.error('Failed to rotate device to : ', rotation, err)
                        })
                })
                .on(wire.ScreenCaptureMessage, (channel, message) => {
                    wdaClient.screenshot()
                        .then(response => {
                            let reply = wireutil.reply(options.serial)
                            let args = {
                                url: url.resolve(options.storageUrl, util.format('s/upload/%s', 'image'))
                            }
                            const imageBuffer = new Buffer(response.value, 'base64')
                            let req = request.post(args, (err, res, body) => {
                                try {
                                    let result = JSON.parse(body)
                                    push.send([
                                        channel,
                                        reply.okay('success', result.resources.file)
                                    ])
                                }
                                catch (err) {
                                    log.error('Invalid JSON in response', err.stack, body)
                                }
                            })
                            req.form().append('file', imageBuffer, {
                                filename: util.format('%s.png', options.serial),
                                contentType: 'image/png'
                            })
                        })
                        .catch(err => {
                            log.error('Failed to get screenshot', err)
                        })
                })
                .handler())
            push.send([
                wireutil.global,
                wireutil.envelope(new wire.CapabilitiesMessage(options.serial, true, false))
            ])
            return Promise.resolve()
        }
        return Wda
    })
