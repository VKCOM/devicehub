import util from 'util'
import {KeyCodesMap} from '@u4/adbkit'

export const namedKey = function(/** @type {string} */ name) {
    const keyCode = 'KEYCODE_' + name.toUpperCase()
    if (!(keyCode in KeyCodesMap)) {
        throw new Error(util.format('Unknown key "%s"', name))
    }
    // @ts-ignore
    return KeyCodesMap[keyCode]
}
export default {
    namedKey
}
