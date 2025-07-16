// devices

import {getDeviceType} from '../../../controllers/devices.js'

export function get(req, res) {
    return getDeviceType(req, res)
}


