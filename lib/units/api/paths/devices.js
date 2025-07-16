// devices

import {getDevices, deleteDevices} from '../controllers/devices.js'

export function get(req, res) {
    return getDevices(req, res)
}


export function del(req, res) {
    return deleteDevices(req, res)
}


