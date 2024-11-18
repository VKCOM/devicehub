// devices

import {renewAdbPort} from '../../../controllers/devices.js'

export function put(req, res, next) {
    return renewAdbPort(req, res, next)
}


