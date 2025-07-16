// groups

import {getGroupUser, addGroupUser, removeGroupUser} from '../../../../controllers/groups.js'

export function get(req, res) {
    return getGroupUser(req, res)
}


export function put(req, res) {
    return addGroupUser(req, res)
}


export function del(req, res) {
    return removeGroupUser(req, res)
}


