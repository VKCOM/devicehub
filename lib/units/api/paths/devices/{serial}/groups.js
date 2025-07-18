// devices

import {getDeviceGroups} from '../../../controllers/devices.js'

export function get(req, res) {
    return getDeviceGroups(req, res)
}


