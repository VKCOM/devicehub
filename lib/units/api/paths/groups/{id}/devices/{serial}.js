// groups

import {getGroupDevice, addGroupDevice, removeGroupDevice} from '../../../../controllers/groups.js'

export function get(req, res, next) {
    return getGroupDevice(req, res)
}


export function put(req, res, next) {
    return addGroupDevice(req, res)
}


export function del(req, res, next) {
    return removeGroupDevice(req, res)
}


