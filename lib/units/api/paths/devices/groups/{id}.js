// devices

import {addOriginGroupDevices, removeOriginGroupDevices} from '../../../controllers/devices.js'

export function put(req, res, next) {
    return addOriginGroupDevices(req, res, next)
}


export function del(req, res, next) {
    return removeOriginGroupDevices(req, res, next)
}


