import syrup from '@devicefarmer/stf-syrup'
import webSocketServer from 'ws'
import websocketStream from 'websocket-stream'
import MjpegConsumer from 'mjpeg-consumer'
import Promise from 'bluebird'
import request from 'postman-request'
import wireutil from '../../../../wire/util.js'
import wire from '../../../../wire/index.js'
import logger from '../../../../util/logger.js'
import iosutil from '../util/iosutil.js'
import solo from '../solo.js'
import devicenotifier from '../devicenotifier.js'
import wdaClient from '../wda/WdaClient.js'
import push from '../../../base-device/support/push.js'
export default syrup.serial()
    .dependency(solo)
    .dependency(devicenotifier)
    .dependency(wdaClient)
    .dependency(push)
    .define(function(options, solo, notifier, WdaClient, push) {
        const log = logger.createLogger('device:plugins:screen:stream')
        const wss = new webSocketServer.Server({port: options.screenPort})
        let url = iosutil.getUri(options.wdaHost, options.mjpegPort)
        wss.on('connection', (ws) => {
            ws.isAlive = true
            let isConnectionAlive = true
            const consumer = new MjpegConsumer()
            let frameStream = null
            let chain = Promise.resolve()
            let stream = websocketStream(ws)
            function handleSocketError(err, message) {
                log.error(message, err)
                notifier.setDeviceTemporaryUnavailable(err)
                ws.close()
            }
            const handleRequestStream = () => {
                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                        if (frameStream !== null) {
                            frameStream.req.end()
                        }
                        frameStream = request.get(url)
                        frameStream.on('response', response => {
                            reject({response, frameStream})
                        })
                        frameStream.on('error', err => {
                        // checking for ws connection in order to stop chain promise if connection closed
                            if (isConnectionAlive) {
                                resolve()
                            }
                            else {
                                reject()
                            }
                        })
                    }, 1000)
                })
            }
            const getRequestStream = () => {
                for (let i = 0; i < 10; i++) {
                    chain = chain.then(() => handleRequestStream())
                }
                chain
                    .then(() => handleSocketError({message: 'Connection failed to WDA MJPEG port'}, 'Consumer error'))
                    .catch(result => {
                        if (result) {
                            result.response.pipe(consumer).pipe(stream)
                            // [VD] We can't launch homeBtn otherwise opening in STF corrupt test automation run. Also no sense to execute connect
                            WdaClient.startSession()
                            // WdaClient.homeBtn() //no existing session detected so we can press home button to wake up device automatically
                            // override already existing error handler
                            result.frameStream.on('error', function(err) {
                                handleSocketError(err, 'frameStream error ')
                            })
                        }
                    })
            }
            consumer.on('error', (err) => {
                handleSocketError(err, 'Consumer error')
                frameStream.req.end()
            // doConnectionToMJPEGStream(fn)
            })
            stream.on('error', () => {
            // handleSocketError(err, 'Stream error ')
                frameStream.req.end()
            })
            stream.socket.on('error', () => {
            // handleSocketError(err, 'Websocket stream error ')
                frameStream.req.end()
            })
            ws.on('close', function() {
            // @TODO handle close event
            // stream.socket.onclose()
                frameStream.req.end()
                const orientation = WdaClient.orientation
                const stoppingSession = () => {
                    WdaClient.stopSession()
                    isConnectionAlive = false
                    log.important('ws on close event')
                }
                if (WdaClient.deviceType === 'Apple TV' || orientation === 'PORTRAIT') {
                    return stoppingSession()
                }
                // #770: Reset rotation to Portrait when closing device
                const rotationPromise = new Promise((resolve, reject) => {
                // Ensure that rotation is done, then stop session
                    WdaClient.rotation({orientation: 'PORTRAIT'})
                    resolve()
                })
                rotationPromise.delay(2000).then(() => stoppingSession())
            })
            ws.on('error', function() {
            // @TODO handle error event
            // stream.socket.onclose()
                WdaClient.stopSession()
                isConnectionAlive = false
                log.important('ws on error event')
            })
            getRequestStream()
        })
    })
