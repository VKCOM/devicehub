// devices

import {getAdbRange} from '../../controllers/devices.js'

export function get(req, res) {
    return getAdbRange(req, res)
}


