import {IOSBatteryState, IOSOrientation, SwipeParams} from '../wda/WDAClient.js'
import _ from 'lodash'
import devices from './devices.json' with {type: 'json'}

export function asciiparser(key: string): string | null {
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

export function degreesToOrientation(degree: number): IOSOrientation {
    switch (degree) {
        case 90:
            return 'LANDSCAPE'
        case 180:
            return 'UIA_DEVICE_ORIENTATION_PORTRAIT_UPSIDEDOWN'
        case 270:
            return 'UIA_DEVICE_ORIENTATION_LANDSCAPERIGHT'
        default: // 0deg or any other
            return 'PORTRAIT'
    }
}

export function orientationToDegrees(orientation: IOSOrientation): number {
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

export function swipe(params: SwipeParams, deviceSize: Record<'width' | 'height', number>) {
    return {
        fromX: params.fromX * deviceSize.width,
        fromY: params.fromY * deviceSize.height,
        toX: params.toX * deviceSize.width,
        toY: params.toY * deviceSize.height,
        duration: params.duration || 0
    }
}

export function getUri(host: string, port: number | string) {
    return `http://${host}:${port}`
}

export function batteryState(state: number): IOSBatteryState {
    switch (state) {
    case 0:
        return 'full'
    case 1:
        return 'unplugged'
    case 2:
        return 'charging'
    default:
        return 'full'
    }
}

export function batteryLevel(level: number | string) {
    if (level === -1) {
        return 1
    }

    if (typeof level === 'string') {
        return Math.round(parseInt(level, 10))
    }

    return Math.round(level)
}

const deviceById = _.keyBy(devices, 'device_id')

export function getModelName(identifier: string): string | null {
    if (!identifier) return null
    const deviceInfo = deviceById[identifier]
    if (deviceInfo) {
        return deviceInfo.full_family || null
    }

    return identifier
}
