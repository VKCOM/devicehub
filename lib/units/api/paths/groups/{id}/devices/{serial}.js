// groups

import {getGroupDevice, addGroupDevice, removeGroupDevice} from '../../../../controllers/groups.js'

export function get(req, res) {
    return getGroupDevice(req, res)
}


export function put(req, res) {
    return addGroupDevice(req, res)
}


export function del(req, res) {
    return removeGroupDevice(req, res)
}


