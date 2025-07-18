// devices

import {generateFakeDevice} from '../../controllers/devices.js'

export function get(req, res) {
    return generateFakeDevice(req, res)
}


