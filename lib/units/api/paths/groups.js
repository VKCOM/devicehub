// groups

import {getGroups, createGroup, deleteGroups} from '../controllers/groups.js'

export function get(req, res, next) {
    return getGroups(req, res, next)
}


export function post(req, res, next) {
    return createGroup(req, res, next)
}


export function del(req, res, next) {
    return deleteGroups(req, res, next)
}


