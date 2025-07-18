// devices

import {addOriginGroupDevices, removeOriginGroupDevices} from '../../../controllers/devices.js'

export function put(req, res) {
    return addOriginGroupDevices(req, res)
}


export function del(req, res) {
    return removeOriginGroupDevices(req, res)
}


