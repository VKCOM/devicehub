// groups

import {getGroup, updateGroup, deleteGroup} from '../../controllers/groups.js'

export function get(req, res, next) {
    return getGroup(req, res)
}


export function put(req, res, next) {
    return updateGroup(req, res)
}


export function del(req, res, next) {
    return deleteGroup(req, res)
}


