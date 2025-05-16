// devices

import {getDeviceBySerial, putDeviceBySerial, deleteDevice} from '../../controllers/devices.js'

export function get(req, res, next) {
    return getDeviceBySerial(req, res)
}


export function put(req, res, next) {
    return putDeviceBySerial(req, res)
}


export function del(req, res, next) {
    return deleteDevice(req, res)
}


