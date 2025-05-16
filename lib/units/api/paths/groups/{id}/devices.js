// groups

import {getGroupDevices, addGroupDevices, removeGroupDevices} from '../../../controllers/groups.js'

export function get(req, res, next) {
    return getGroupDevices(req, res)
}


export function put(req, res, next) {
    return addGroupDevices(req, res)
}


export function del(req, res, next) {
    return removeGroupDevices(req, res)
}


