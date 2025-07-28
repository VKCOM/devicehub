import util from 'util'
import {KeyCodes} from '@irdk/adbkit'

export const namedKey = function(name) {
    const key = KeyCodes['KEYCODE_' + name.toUpperCase()]
    if (typeof key === 'undefined') {
        throw new Error(util.format('Unknown key "%s"', name))
    }
    return key
}
export default {
    namedKey
}
