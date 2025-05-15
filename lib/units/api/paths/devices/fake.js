// devices

import {generateFakeDevice} from '../../controllers/devices.js'

export function get(req, res, next) {
    return generateFakeDevice(req, res, next)
}


