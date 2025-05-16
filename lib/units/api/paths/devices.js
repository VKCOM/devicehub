// devices

import {getDevices, deleteDevices} from '../controllers/devices.js'

export function get(req, res, next) {
    return getDevices(req, res)
}


export function del(req, res, next) {
    return deleteDevices(req, res)
}


