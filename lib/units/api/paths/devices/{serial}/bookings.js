// devices

import {getDeviceBookings} from '../../../controllers/devices.js'

export function get(req, res, next) {
    return getDeviceBookings(req, res, next)
}


