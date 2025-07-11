import syrup from '@devicefarmer/stf-syrup'
import rfb from 'rfb2'
import jpeg from 'jpeg-js'
import WebSocket from 'ws'
import wireutil from '../../../../wire/util.js'
import wire from '../../../../wire/index.js'
import keyNameToX11KeyCode from '../util.js'
import loggerM from'../../../../util/logger.js'
const logger = loggerM.createLogger('vnc-device:stream')

import solo from '../solo.js'
import devicenotifier from '../devicenotifier.js'
import push from '../../../base-device/support/push.js'
import router from '../../../base-device/support/router.js'
import group from '../group.js'
import {decode} from '../../../../util/jwtutil.js'
import {NoGroupError} from '../../../../util/grouputil.js'

export default syrup.serial()
    .dependency(solo)
    .dependency(devicenotifier)
    .dependency(push)
    .dependency(router)
    .dependency(group)
    .define(function(options, solo, notifier, push, router, group) {
        const wss = new WebSocket.Server({port: options.screenPort})

        wss.on('connection', async function connection(ws) {
            // Extract token from WebSocket subprotocols
            const token = ws.protocol.substring('access_token.'.length)
            const user = !!token && decode(token, options.secret)

            if (!token || !user) {
                // logger.warn('WebSocket connection attempt without token from %s', req.socket.remoteAddress)
                logger.warn('WebSocket connection attempt without token to vnc device %s', options.serial)
                ws.send(JSON.stringify({
                    type: 'auth_error',
                    message: 'Authentication token required'
                }))
                ws.close(1008, 'Authentication token required')
                return
            }

            let authed = false
            const tryCheckDeviceGroup = async(fail = false) => {
                try {
                    await new Promise(r => setTimeout(r, 200))

                    const deviceGroup = await group.get()
                    if (deviceGroup.email !== user?.email) {
                        const err = 'Device used by another user'
                        logger.warn('WebSocket authentication failed for device %s: $s', options.serial, err)
                        ws.send(JSON.stringify({
                            type: 'auth_error',
                            message: err
                        }))
                        ws.close(1008, 'Authentication failed')
                        return
                    }

                    authed = true
                    logger.info('WebSocket authenticated for device %s', options.serial)

                    // Send success message
                    ws.send(JSON.stringify({
                        type: 'auth_success',
                        message: 'Authentication successful'
                    }))
                }
                catch (/** @type {any} */err) {
                    if (!fail && err instanceof NoGroupError) {
                        await new Promise(r => setTimeout(r, 1000))
                        return tryCheckDeviceGroup(true)
                    }

                    logger.error('WebSocket authentication error for device %s: %s', options.serial, err.message)
                    ws.send(JSON.stringify({
                        type: 'auth_error',
                        message: 'Authentication error'
                    }), () => {})
                    ws.close(1008, 'Authentication error')
                }
            }

            await tryCheckDeviceGroup()

            let height, width
            let lastClicked = {x: 0, y: 0}

            const r = rfb.createConnection({
                host: options.deviceUrl,
                port: 5900,
                password: options.devicePassword
            })

            r.on('connect', function() {
                logger.info('successfully connected and authorised')
                logger.info('remote screen name: ' + r.title + ' width:' + r.width + ' height: ' + r.height)
                width = r.width
                height = r.height
                push.send([
                    wireutil.global,
                    wireutil.envelope(new wire.SizeIosDevice(
                        options.serial
                        , r.height
                        , r.width
                        , 1
                    ))
                ])
            })

            r.on('error', function(error) {
                throw new Error(error)
            })

            r.on('rect', function(rect) {
                const image = jpeg.encode({data: rect.data, width: rect.width, height: rect.height}, options.screenJpegQuality)
                ws.send(image.data)
                r.requestUpdate(false, 0, 0, r.width, r.height)
            })

            ws.on('error', function close() {
                logger.info('Closing vnc connection because websocket closed')
                if (authed) {
                    r.end()
                }
            })

            router
                .on(wire.GestureStartMessage, function(channel, message) {
                })
                .on(wire.GestureStopMessage, function(channel, message) {
                })
                .on(wire.TouchDownMessage, function(channel, message) {
                    lastClicked.x = message.x * height
                    lastClicked.y = message.y * width
                    r.pointerEvent(message.x * height, message.y * width, 1)
                })
                .on(wire.TouchMoveMessage, function(channel, message) {
                })
                .on(wire.TouchUpMessage, function(channel, message) {
                })
                .on(wire.TouchCommitMessage, function(channel, message) {
                })
                .on(wire.TouchResetMessage, function(channel, message) {
                })
                .on(wire.TypeMessage, function(channel, message) {
                    let keyCode = message.text.charCodeAt(0)
                    r.keyEvent(keyCode, 1)
                    r.keyEvent(keyCode, 0)
                    r.requestUpdate(false, 0, 0, r.width, r.height)
                })
                .on(wire.KeyDownMessage, function(channel, message) {
                    r.keyEvent(keyNameToX11KeyCode(message.key), 1)
                    r.requestUpdate(false, 0, 0, r.width, r.height)
                })
                .on(wire.KeyUpMessage, function(channel, message) {
                    r.keyEvent(keyNameToX11KeyCode(message.key), 0)
                    r.requestUpdate(false, 0, 0, r.width, r.height)
                })
        })
    })
