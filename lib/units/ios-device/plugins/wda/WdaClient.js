import net from 'net'
import request from 'request-promise'
import Promise from 'bluebird'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../../util/logger.js'
import * as iosutil from '../util/iosutil.js'
import wireutil from '../../../../wire/util.js'
import wire from '../../../../wire/index.js'
import lifecycle from '../../../../util/lifecycle.js'
import db from '../../../../db/index.js'
import dbapi from '../../../../db/api.js'
import devicenotifier from '../devicenotifier.js'
import push from '../../../base-device/support/push.js'
const LOG_REQUEST_MSG = 'Request has been sent to WDA with data: '
export default syrup.serial()
    .dependency(devicenotifier)
    .dependency(push)
    .define(async(options, notifier, push) => {
        const log = logger.createLogger('wdaClient')
        log.info('WdaClient.js initializing...')
        await db.connect()
        const socket = new net.Socket() // wtf why is this not part of the WdaClient object?

        class WdaClient {
            baseUrl = iosutil.getUri(options.wdaHost, options.wdaPort)
            sessionId = null
            deviceSize = null
            orientation = null
            touchDownParams = {}
            tapStartAt = 0

            /**
             * @type {{ type: string; value: any; }[]}
             */
            typeKeyActions = []
            typeKeyTimerId = null
            typeKeyDelay = 250
            upperCase = false
            isSwiping = false
            isRotating = false
            deviceType = null
            getDeviceType() {
                if (this.deviceType !== null) {
                    return this.deviceType
                }
                return dbapi.getDeviceType(options.serial).then((deviceType) => {
                    if (!deviceType) {
                        return null
                    }
                    log.info('Reusing device type value: ', deviceType)
                    this.deviceType = deviceType
                    return this.deviceType
                }).catch((err) => {
                    log.error('Error getting device type from DB')
                    return lifecycle.fatal(err)
                })
            }
            startSession() {
                log.info('verifying wda session status...')
                this.getDeviceType()
                const params = {
                    capabilities: {},
                }
                return this.handleRequest({
                    method: 'POST',
                    uri: `${this.baseUrl}/session`,
                    body: params,
                    json: true,
                })
                    .then((sessionResponse) => {
                        return this.handleRequest({
                            method: 'GET',
                            uri: `${this.baseUrl}/status`,
                            json: true,
                        })
                            .then((statusResponse) => {
                                log.info(`status response: ${JSON.stringify(statusResponse)}`)
                                // handles case of existing session
                                if (statusResponse.sessionId) {
                                    this.sessionId = statusResponse.sessionId
                                    log.info(`reusing existing wda session: ${this.sessionId}`)
                                    this.setStatus(3)
                                    if (this.deviceType !== 'Apple TV') {
                                        this.getOrientation()
                                        this.batteryIosEvent()
                                    }
                                    this.setVersion(sessionResponse)
                                    return this.size()
                                }
                                log.info('starting wda session...')
                                return this.handleRequest({
                                    method: 'POST',
                                    uri: `${this.baseUrl}/session`,
                                    body: params,
                                    json: true,
                                })
                                    .then((sessionResponse) => {
                                        log.info(`startSession response: ${JSON.stringify(sessionResponse)}`)
                                        this.setVersion(sessionResponse)
                                        this.sessionId = sessionResponse.sessionId
                                        log.info(`sessionId: ${this.sessionId}`)
                                        if (this.deviceType !== 'Apple TV') {
                                            this.getOrientation()
                                            this.batteryIosEvent()
                                        }
                                        this.setStatus(3)
                                        return this.size()
                                    })
                                    .catch((err) => {
                                        log.error('"startSession" No valid response from web driver!', err)
                                        return Promise.reject(err)
                                    })
                            })
                    })
            }
            stopSession() {
                log.info('stopping wda session: ', this.sessionId)
                let currentSessionId = this.sessionId
                this.sessionId = null
                if (currentSessionId === null) {
                    return Promise.resolve()
                }
                return this.handleRequest({
                    method: 'DELETE',
                    uri: `${this.baseUrl}/session/${currentSessionId}`
                })
            }
            setStatus(status) {
                push.send([
                    wireutil.global,
                    wireutil.envelope(new wire.DeviceStatusMessage(options.serial, status))
                ])
            }
            typeKey(params) {
            // collect several chars till the space and do mass actions...
                if (!params.value || !params.value[0]) {
                    return
                }
                let [value] = params.value
                // register keyDown and keyUp for current char
                if (this.upperCase) {
                    value = value.toUpperCase()
                }
                this.typeKeyActions.push({type: 'keyDown', value})
                this.typeKeyActions.push({type: 'keyUp', value})
                const handleRequest = () => {
                    const requestParams = {
                        method: 'POST',
                        uri: `${this.baseUrl}/session/${this.sessionId}/actions`,
                        body: {
                            actions: [
                                {
                                    type: 'key',
                                    id: 'keyboard',
                                    actions: this.typeKeyActions,
                                }
                            ]
                        },
                        json: true,
                    }
                    // reset this.typeKeyActions array as we are going to send word or char(s) by timeout
                    this.typeKeyActions = []
                    if (this.typeKeyTimerId) {
                    // reset type key timer as we are going to send word or char(s) by timeout
                        clearTimeout(this.typeKeyTimerId)
                        this.typeKeyTimerId = null
                    }
                    if (this.deviceType !== 'Apple TV') {
                        return this.handleRequest(requestParams)
                    }
                    // Apple TV keys
                    switch (true) {
                    case value === '\v':
                        return this.handleRequest({
                            method: 'POST',
                            uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
                            body: {name: 'left'},
                            json: true,
                        })
                    case value === '\f':
                        return this.handleRequest({
                            method: 'POST',
                            uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
                            body: {name: 'right'},
                            json: true,
                        })
                    case value === '\0':
                        return this.handleRequest({
                            method: 'POST',
                            uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
                            body: {name: 'up'},
                            json: true,
                        })
                    case value === '\x18':
                        return this.handleRequest({
                            method: 'POST',
                            uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
                            body: {name: 'down'},
                            json: true,
                        })
                    case value === '\r':
                        return this.handleRequest({
                            method: 'POST',
                            uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
                            body: {name: 'select'},
                            json: true,
                        })
                    default:
                        break
                    }
                }
                if (value === ' ') {
                // as only space detected send full word to the iOS device
                    handleRequest()
                }
                else {
                // reset timer to start tracker again from the latest char. Final flush will happen if no types during this.typeKeyDelay ms
                    if (this.typeKeyTimerId) {
                        clearTimeout(this.typeKeyTimerId)
                    }
                    this.typeKeyTimerId = setTimeout(handleRequest, this.typeKeyDelay)
                }
            }
            tap(params) {
                this.tapStartAt = (new Date()).getTime()
                this.touchDownParams = params
            }
            homeBtn() {
                if (this.deviceType !== 'Apple TV') {
                    return this.handleRequest({
                        method: 'POST',
                        uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
                        body: {name: 'home'},
                        json: true
                    }).then(() => {
                    // #801 Reset coordinates to Portrait mode after pressing home button
                        return this.rotation({orientation: 'PORTRAIT'})
                    })
                }
                else {
                // #749: Fixing button action for AppleTV
                    return this.handleRequest({
                        method: 'POST',
                        uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
                        body: {name: 'menu'},
                        json: true
                    })
                }
            }
            swipe(params) {
                const scale = iosutil.swipe(this.orientation, params, this.deviceSize)
                const body = {
                    actions: [
                        {
                            type: 'pointer',
                            id: 'finger1',
                            parameters: {pointerType: 'touch'},
                            actions: [
                                {type: 'pointerMove', duration: 0, x: scale.fromX, y: scale.fromY},

                                {type: 'pointerMove',
                                    duration: scale.duration * 1000,
                                    x: scale.toX,
                                    // eslint-disable-next-line no-nested-ternary
                                    y: (scale.fromY < scale.toY) ? scale.toY - (scale.toY / 4) : (scale.fromY - scale.toY >= 50 ? scale.toY + (scale.toY / 4) : scale.toY)},
                                {type: 'pointerUp'}
                            ],
                        }
                    ],
                }
                if (this.deviceType === 'Apple TV') {
                    return log.error('Swipe is not supported')
                }
                let swipeOperation = () => {
                    if (!this.isSwiping) {
                        this.isSwiping = true
                        this.handleRequest({
                            method: 'POST',
                            uri: `${this.baseUrl}/session/${this.sessionId}/actions`,
                            body,
                            json: true,
                        }).then((response) => {
                            log.info('swipe response: ', response)
                            this.isSwiping = false
                        })
                    }
                }
                return swipeOperation()
            }
            touchUp() {
                if (!this.isSwiping && this.deviceSize) {
                    let {x, y} = this.touchDownParams
                    x *= this.deviceSize.width
                    y *= this.deviceSize.height
                    if (((new Date()).getTime() - this.tapStartAt) <= 1000 || !this.tapStartAt) {
                        const body = {
                            actions: [
                                {
                                    type: 'pointer',
                                    id: 'finger1',
                                    parameters: {pointerType: 'touch'},
                                    actions: [
                                        {type: 'pointerMove', duration: 0, x, y},
                                        {type: 'pointerMove', duration: 0, x, y},
                                        {type: 'pointerUp'}
                                    ],
                                }
                            ],
                        }
                        if (this.deviceType !== 'Apple TV') {
                            log.info(options.deviceName)
                            return this.handleRequest({
                                method: 'POST',
                                uri: `${this.baseUrl}/session/${this.sessionId}/actions`,
                                body,
                                json: true,
                            })
                        // else if (deviceType === 'Watch_OS') {...}
                        }
                        else {
                        // Avoid crash, wait until width/height values are available
                            if (x >= 0 && y >= 0) {
                                switch (true) {
                                case x < 300:
                                    return this.handleRequest({
                                        method: 'POST',
                                        uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
                                        body: {name: 'left'},
                                        json: true,
                                    })
                                case x > 1650:
                                    return this.handleRequest({
                                        method: 'POST',
                                        uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
                                        body: {name: 'right'},
                                        json: true,
                                    })
                                case y > 850:
                                    return this.handleRequest({
                                        method: 'POST',
                                        uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
                                        body: {name: 'down'},
                                        json: true,
                                    })
                                case y < 250:
                                    return this.handleRequest({
                                        method: 'POST',
                                        uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
                                        body: {name: 'up'},
                                        json: true,
                                    })
                                default:
                                    return this.handleRequest({
                                        method: 'POST',
                                        uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
                                        body: {name: 'select'},
                                        json: true,
                                    })
                                }
                            }
                        }
                    }
                    else {
                        if (this.deviceType === 'Apple TV') {
                            return log.error('Holding tap is not supported')
                        }
                        return this.handleRequest({
                            method: 'POST',
                            uri: `${this.baseUrl}/session/${this.sessionId}/wda/touchAndHold`,
                            body: {x, y, duration: 1},
                            json: true,
                        })
                    }
                }
            }
            tapDeviceTreeElement(message) {
                const params = {
                    using: 'link text',
                    value: 'label=' + message.label,
                }
                return new Promise((resolve, reject) => {
                    this.handleRequest({
                        method: 'POST',
                        uri: `${this.baseUrl}/session/${this.sessionId}/elements`,
                        body: params,
                        json: true
                    })
                        .then(response => {
                            const {ELEMENT} = response.value[0]
                            return this.handleRequest({
                                method: 'POST',
                                uri: `${this.baseUrl}/session/${this.sessionId}/element/${ELEMENT}/click`,
                                body: {},
                                json: true
                            })
                        })
                        .catch(err => {
                            log.error(err)
                        })
                })
            }
            doubleClick() {
                if (!this.isSwiping && this.deviceSize) {
                    const {x, y} = this.touchDownParams
                    const params = {
                        x: x * this.deviceSize.width,
                        y: y * this.deviceSize.height
                    }
                    return this.handleRequest({
                        method: 'POST',
                        uri: `${this.baseUrl}/session/${this.sessionId}/wda/doubleTap`,
                        body: params,
                        json: true
                    })
                }
            }
            size() {
                if (this.deviceSize !== null) {
                    return this.deviceSize
                }
                log.info('getting device window size...')
                return dbapi.getDeviceDisplaySize(options.serial).then((deviceSize) => {
                    if (!deviceSize) {
                        return null
                    }
                    let dbHeight = deviceSize.height
                    let dbWidth = deviceSize.width
                    let dbScale = deviceSize.scale
                    if (!dbHeight || !dbWidth || !dbScale) {
                        return null
                    }
                    // Reuse DB values:
                    log.info('Reusing device size/scale')
                    // Set device size based on orientation, default is PORTRAIT
                    if (this.orientation === 'PORTRAIT' || !this.orientation) {
                        this.deviceSize = {height: dbHeight /= dbScale, width: dbWidth /= dbScale}
                    }
                    else if (this.orientation === 'LANDSCAPE') {
                        this.deviceSize = {height: dbWidth /= dbScale, width: dbHeight /= dbScale}
                    }
                    else if (this.deviceType === 'Apple TV') {
                        this.deviceSize = {height: dbHeight, width: dbWidth}
                    }
                    return this.deviceSize
                })
                    .catch((err) => {
                        log.error('Error getting device size from DB')
                        return lifecycle.fatal(err)
                    })
            }
            setVersion(currentSession) {
                log.info('Setting current device version: ' + currentSession.value.capabilities.sdkVersion)
                push.send([
                    wireutil.global,
                    wireutil.envelope(new wire.SdkIosVersion(options.serial, currentSession.value.capabilities.sdkVersion))
                ])
            }
            openUrl(message) {
                const params = {
                    url: message.url
                }
                return this.handleRequest({
                    method: 'POST',
                    uri: `${this.baseUrl}/session/` + this.sessionId + '/url',
                    body: params,
                    json: true
                })
            }
            screenshot() {
                return new Promise((resolve, reject) => {
                    this.handleRequest({
                        method: 'GET',
                        uri: `${this.baseUrl}/screenshot`,
                        json: true
                    })
                        .then(response => {
                            try {
                                resolve(response)
                            }
                            catch (e) {
                                reject(e)
                            }
                        })
                        .catch(err => reject(err))
                })
            }
            getOrientation() {
                return this.handleRequest({
                    method: 'GET',
                    uri: `${this.baseUrl}/session/${this.sessionId}/orientation`,
                    json: true
                }).then((orientationResponse) => {
                    this.orientation = orientationResponse.value
                    log.info('Current device orientation: ' + this.orientation)
                })
            }
            rotation(params) {
                this.orientation = params.orientation
                this.isRotating = true
                return this.handleRequest({
                    method: 'POST',
                    uri: `${this.baseUrl}/session/${this.sessionId}/orientation`,
                    body: params,
                    json: true
                }).then(val => {
                    this.getOrientation()
                    this.size()
                    const rotationDegrees = iosutil.orientationToDegrees(this.orientation)
                    push.send([
                        wireutil.global,
                        wireutil.envelope(new wire.RotationEvent(options.serial, rotationDegrees))
                    ])
                    this.isRotating = false
                })
            }
            batteryIosEvent() {
                return this.handleRequest({
                    method: 'GET',
                    uri: `${this.baseUrl}/session/${this.sessionId}/wda/batteryInfo`,
                    json: true,
                })
                    .then((batteryInfoResponse) => {
                        let batteryState = iosutil.batteryState(batteryInfoResponse.value.state)
                        let batteryLevel = iosutil.batteryLevel(batteryInfoResponse.value.level)
                        push.send([
                            wireutil.global,
                            wireutil.envelope(new wire.BatteryEvent(options.serial, batteryState, 'good', 'usb', batteryLevel, 1, 0.0, 5))
                        ])
                    })
                    .then(() => {
                        log.info('Setting new device battery info')
                    })
                    .catch((err) => log.info(err))
            }
            getTreeElements() {
                return this.handleRequest({
                    method: 'GET',
                    uri: `${this.baseUrl}/source?format=json`,
                    json: true
                })
            }
            pressButtonSendRequest(params) {
                return this.handleRequest({
                    method: 'POST',
                    uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
                    body: {
                        name: params
                    },
                    json: true
                })
            }
            switchCharset() {
                this.upperCase = !this.upperCase
                log.info(this.upperCase)
            }
            appActivate(params) {
                return this.handleRequest({
                    method: 'POST',
                    uri: `${this.baseUrl}/session/${this.sessionId}/wda/apps/activate`,
                    body: {
                        bundleId: params
                    },
                    json: true
                })
            }
            pressPower() {
                return this.handleRequest({
                    method: 'GET',
                    uri: `${this.baseUrl}/session/${this.sessionId}/wda/locked`,
                    json: true
                })
                    .then(response => {
                        let url = ''
                        if (response.value === true) {
                            url = `${this.baseUrl}/session/${this.sessionId}/wda/unlock`
                        }
                        else {
                            url = `${this.baseUrl}/session/${this.sessionId}/wda/lock`
                        }
                        return this.handleRequest({
                            method: 'POST',
                            uri: url,
                            json: true
                        })
                    })
            }
            getClipBoard() {
                return this.handleRequest({
                    method: 'POST',
                    uri: `${this.baseUrl}/session/${this.sessionId}/wda/getPasteboard`
                })
                    .then(res => {
                        let clipboard = Buffer.from(JSON.parse(res).value, 'base64').toString('utf-8')
                        return clipboard || 'No clipboard data'
                    })
            }
            handleRequest(requestOpt) {
                return new Promise((resolve, reject) => {
                    request(requestOpt)
                        .then(response => {
                            log.verbose(LOG_REQUEST_MSG, JSON.stringify(requestOpt))
                            return resolve(response)
                        })
                        .catch(err => {
                            let errMes = ''
                            if (err?.error?.value?.message) {
                                errMes = err.error.value.message
                            }
                            // #762 & #864: Skip lock/unlock error messages
                            if (errMes.includes('Timed out while waiting until the screen gets locked') || errMes.includes('unlocked')) {
                                return
                            }
                            // #765: Skip rotation error message
                            if (errMes.includes('Unable To Rotate Device')) {
                                return log.info('The current application does not support rotation')
                            }
                            // #770 Skip session crash, immediately restart after Portrait mode reset
                            if (errMes.includes('Session does not exist')) {
                                return this.startSession()
                            }
                            // #409: capture wda/appium crash asap and exit with status 1 from stf
                            // notifier.setDeviceTemporaryUnavialable(err)
                            notifier.setDeviceAbsent(err)
                            lifecycle.fatal(err) // exit with error code 1 is the best way to activate valid auto-healing steps with container(s) restart
                        })
                })
            }
            pressButton(key) {
                switch (key) {
                case 'settings':
                    if (this.deviceType === 'Apple TV') {
                        return this.appActivate('com.apple.TVSettings')
                    }
                    return this.appActivate('com.apple.Preferences')
                case 'store':
                    if (this.deviceType === 'Apple TV') {
                        return this.appActivate('com.apple.TVAppStore')
                    }
                    return this.appActivate('com.apple.AppStore')
                case 'volume_up':
                    return this.pressButtonSendRequest('volumeUp')
                case 'volume_down':
                    return this.pressButtonSendRequest('volumeDown')
                case 'power':
                    return this.pressPower()
                case 'camera':
                    return this.appActivate('com.apple.camera')
                case 'search':
                    if (this.deviceType === 'Apple TV') {
                        return this.appActivate('com.apple.TVSearch')
                    }
                    return this.appActivate('com.apple.mobilesafari')
                case 'finder':
                    return this.appActivate('com.apple.findmy')
                case 'home':
                    return this.homeBtn()
                case 'mute': {
                    let i
                    for (i = 0; i < 16; i++) {
                        Promise.delay(1000).then(() => {
                            this.pressButtonSendRequest('volumeDown')
                        })
                    }
                    return true
                }
                case 'switch_charset': {
                    return this.switchCharset()
                }
                // Media button requests in case there's future WDA compatibility
                case 'media_play_pause':
                    return log.error('Non-existent button in WDA')
                case 'media_stop':
                    return log.error('Non-existent button in WDA')
                case 'media_next':
                    return log.error('Non-existent button in WDA')
                case 'media_previous':
                    return log.error('Non-existent button in WDA')
                case 'media_fast_forward':
                    return log.error('Non-existent button in WDA')
                case 'media_rewind':
                    return log.error('Non-existent button in WDA')
                default:
                    return this.pressButtonSendRequest(key)
                }
            }
        }

        /*
        * WDA MJPEG connection is stable enough to be track status wda server itself.
        * As only connection is closed or error detected we have to restart STF
        */
        function connectToWdaMjpeg(options) {
            log.info('connecting to WdaMjpeg')
            socket.connect(options.mjpegPort, options.wdaHost, () => {
                log.info(`Connected to WdaMjpeg ${options.wdaHost}:${options.mjpegPort}`)
            })
            // #410: Use status 6 (preparing) on WDA startup
            push.send([
                wireutil.global,
                wireutil.envelope(new wire.DeviceStatusMessage(options.serial, 6))
            ])
        }
        async function wdaMjpegCloseEventHandler(hadError) {
            console.log(`WdaMjpeg connection was closed${hadError ? ' by error' : ''}`)
            notifier.setDeviceAbsent('WdaMjpeg connection is lost')
            lifecycle.fatal('WdaMjpeg connection is lost')
            push.send([
                wireutil.global,
                wireutil.envelope(new wire.DeviceStatusMessage(options.serial, 3))
            ])
        }
        socket.on('close', wdaMjpegCloseEventHandler)
        connectToWdaMjpeg(options)
        return new WdaClient()
    })
