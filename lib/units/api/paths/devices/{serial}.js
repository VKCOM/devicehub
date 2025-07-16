// devices

import {getDeviceBySerial, putDeviceBySerial, deleteDevice} from '../../controllers/devices.js'

export function get(req, res) {
    return getDeviceBySerial(req, res)
}


export function put(req, res) {
    return putDeviceBySerial(req, res)
}


export function del(req, res) {
    return deleteDevice(req, res)
}


