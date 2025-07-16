// groups

import {getGroupUsers, addGroupUsers, removeGroupUsers} from '../../../controllers/groups.js'

export function get(req, res) {
    return getGroupUsers(req, res)
}


export function put(req, res) {
    return addGroupUsers(req, res)
}


export function del(req, res) {
    return removeGroupUsers(req, res)
}


