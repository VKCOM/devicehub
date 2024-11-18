// devices

import {getDeviceSize} from '../../../controllers/devices.js'

export function get(req, res, next) {
    return getDeviceSize(req, res, next)
}


