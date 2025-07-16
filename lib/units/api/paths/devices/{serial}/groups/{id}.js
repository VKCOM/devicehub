// devices

import {addOriginGroupDevice, removeOriginGroupDevice} from '../../../../controllers/devices.js'

export function put(req, res) {
    return addOriginGroupDevice(req, res)
}


export function del(req, res) {
    return removeOriginGroupDevice(req, res)
}


