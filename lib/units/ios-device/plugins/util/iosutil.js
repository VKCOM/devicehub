import fs from 'fs'
import path from 'path'
import logger from '../../../../util/logger.js'
import bluebird from 'bluebird'
const {Promise} = bluebird
const log = logger.createLogger('iosutil')
let iosutil = {
    asciiparser: function(key) {
        switch (key) {
            case 'tab':
                return '\x09'
            case 'enter':
                return '\r'
            case 'del':
                return '\x08'
            // Disable keys (otherwise it sends the first character of key string on default case)
            case 'dpad_left':
                return '\v'
            case 'dpad_up':
                return '\0'
            case 'dpad_right':
                return '\f'
            case 'dpad_down':
                return '\x18'
            case 'caps_lock':
            case 'escape':
            case 'home':
                return null
            default:
                return key
        }
    }
    , degreesToOrientation: function(degree) {
        switch (degree) {
            case 0:
                return 'PORTRAIT'
            case 90:
                return 'LANDSCAPE'
            case 180:
                return 'UIA_DEVICE_ORIENTATION_PORTRAIT_UPSIDEDOWN'
            case 270:
                return 'UIA_DEVICE_ORIENTATION_LANDSCAPERIGHT'
        }
    }
    , orientationToDegrees: function(orientation) {
        switch (orientation) {
            case 'PORTRAIT':
                return 0
            case 'LANDSCAPE':
                return 90
            case 'UIA_DEVICE_ORIENTATION_PORTRAIT_UPSIDEDOWN':
                return 180
            case 'UIA_DEVICE_ORIENTATION_LANDSCAPERIGHT':
                return 270
        }
    }
    , pressButton: function(key) {
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
                return this.pressButton('volumeUp')
            case 'volume_down':
                return this.pressButton('volumeDown')
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
                        this.pressButton('volumeDown')
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
                return this.pressButton(key)
        }
    }
    , swipe: function(orientation, params, deviceSize) {
        switch (orientation) {
            case 'PORTRAIT':
                return {
                    fromX: params.fromX * deviceSize.width
                    , fromY: params.fromY * deviceSize.height
                    , toX: params.toX * deviceSize.width
                    , toY: params.toY * deviceSize.height
                    , duration: params.duration
                }
            case 'LANDSCAPE':
                return {
                    fromX: params.fromX * deviceSize.width
                    , fromY: params.fromY * deviceSize.height
                    , toX: params.toX * deviceSize.width
                    , toY: params.toY * deviceSize.height
                    , duration: params.duration
                }
            default:
                return {
                    fromX: params.fromX * deviceSize.width
                    , fromY: params.fromY * deviceSize.height
                    , toX: params.toX * deviceSize.width
                    , toY: params.toY * deviceSize.height
                    , duration: params.duration
                }
        }
    }
    , getUri: function(host, port) {
        return `http://${host}:${port}`
    }
    , batteryState: function(state) {
        switch (state) {
            case 0:
                return 'full'
            case 1:
                return 'unplugged'
            case 2:
                return 'charging'
            case 3:
                return 'full'
            default:
                break
        }
    }
    , batteryLevel: function(level) {
        switch (level) {
            case -1:
                return 100
            default:
                return parseInt(level * 100, 10)
        }
    }
}
export default iosutil
