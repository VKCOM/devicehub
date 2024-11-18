// groups

import {getGroupDevice, addGroupDevice, removeGroupDevice} from '../../../../controllers/groups.js'

export function get(req, res, next) {
    return getGroupDevice(req, res, next)
}


export function put(req, res, next) {
    return addGroupDevice(req, res, next)
}


export function del(req, res, next) {
    return removeGroupDevice(req, res, next)
}


