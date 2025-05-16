// groups

import {getGroups, createGroup, deleteGroups} from '../controllers/groups.js'

export function get(req, res, next) {
    return getGroups(req, res)
}


export function post(req, res, next) {
    return createGroup(req, res)
}


export function del(req, res, next) {
    return deleteGroups(req, res)
}


