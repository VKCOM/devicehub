// groups

import {getGroupUsers, addGroupUsers, removeGroupUsers} from '../../../controllers/groups.js'

export function get(req, res, next) {
    return getGroupUsers(req, res)
}


export function put(req, res, next) {
    return addGroupUsers(req, res)
}


export function del(req, res, next) {
    return removeGroupUsers(req, res)
}


