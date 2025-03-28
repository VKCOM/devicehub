import logger from '../../../../util/logger.js'
import bluebird from 'bluebird'
import devices from './devices.json' assert {type: "json"}
import _ from 'lodash'
const {Promise} = bluebird
const log = logger.createLogger('iosutil')

/**
 * @param {string} key key from wire
 * @returns {string | null} string to send to wda
 */
export function asciiparser(key) {
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

/** @typedef {'PORTRAIT' | 'LANDSCAPE' | 'UIA_DEVICE_ORIENTATION_LANDSCAPERIGHT' | 'UIA_DEVICE_ORIENTATION_PORTRAIT_UPSIDEDOWN'} Orientation */

/**
 * @param {number} degree angle
 * @returns {Orientation | null} orientation for WDA
 */
export function degreesToOrientation(degree) {
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
    return null
}


/**
 * @param {Orientation} orientation orientation from wda
 * @returns {number} Angle of rotation
 */
// eslint is not aware of typescript
// eslint-disable-next-line consistent-return
export function orientationToDegrees(orientation) {
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

/**
 * @param {any} orientation
 * @param {{ fromX: number; fromY: number; toX: number; toY: number; duration: any; }} params
 * @param {{ width: number; height: number; }} deviceSize
 */
export function swipe(orientation, params, deviceSize) {
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

/**
 * @param {any} host
 * @param {any} port
 */
export function getUri(host, port) {
    return `http://${host}:${port}`
}

/**
 * @param {any} state
 */
export function batteryState(state) {
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

/**
 * @param {number | string} level
 */
export function batteryLevel(level) {
    switch (level) {
    case -1:
        return 100
    default:
        if (typeof level === "string") {
            return Math.round(parseInt(level, 10) * 100)
        } else {
            return Math.round(level * 100)
        }
    }
}

const deviceById = _.keyBy(devices, 'device_id')

/**
 * @param {string} identifier
 * @returns {string} device family name
 */
export function getModelName(identifier) {
    const deviceInfo = deviceById[identifier]
    if(deviceInfo) {
        return deviceInfo.full_family || `${identifier} (unknown full family)`
    }
    return identifier
}
