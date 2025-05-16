// groups

import {getGroupUser, addGroupUser, removeGroupUser} from '../../../../controllers/groups.js'

export function get(req, res, next) {
    return getGroupUser(req, res)
}


export function put(req, res, next) {
    return addGroupUser(req, res)
}


export function del(req, res, next) {
    return removeGroupUser(req, res)
}


