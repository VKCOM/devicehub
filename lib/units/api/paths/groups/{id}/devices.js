// groups

import {getGroupDevices, addGroupDevices, removeGroupDevices} from '../../../controllers/groups.js'

export function get(req, res, next) {
    return getGroupDevices(req, res, next)
}


export function put(req, res, next) {
    return addGroupDevices(req, res, next)
}


export function del(req, res, next) {
    return removeGroupDevices(req, res, next)
}


