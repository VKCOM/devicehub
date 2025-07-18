// devices

import {getDeviceBookings} from '../../../controllers/devices.js'

export function get(req, res) {
    return getDeviceBookings(req, res)
}


