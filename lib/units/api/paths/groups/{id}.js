// groups

import {getGroup, updateGroup, deleteGroup} from '../../controllers/groups.js'

export function get(req, res) {
    return getGroup(req, res)
}


export function put(req, res) {
    return updateGroup(req, res)
}


export function del(req, res) {
    return deleteGroup(req, res)
}


