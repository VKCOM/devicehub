// devices

import {getDeviceOwner} from '../../../controllers/devices.js'

export function get(req, res) {
    return getDeviceOwner(req, res)
}


