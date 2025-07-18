// devices

import {useDeviceByUser} from '../../../controllers/devices.js'

export function post(req, res) {
    return useDeviceByUser(req, res)
}


