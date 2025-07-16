// groups

import {getGroups, createGroup, deleteGroups} from '../controllers/groups.js'

export function get(req, res) {
    return getGroups(req, res)
}


export function post(req, res) {
    return createGroup(req, res)
}


export function del(req, res) {
    return deleteGroups(req, res)
}


