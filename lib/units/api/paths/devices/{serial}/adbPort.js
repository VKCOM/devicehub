// devices

import {renewAdbPort} from '../../../controllers/devices.js'

export function put(req, res) {
    return renewAdbPort(req, res)
}


