// groups

import {addGroupModerator, removeGroupModerator} from '../../../../controllers/groups.js'

export function put(req, res) {
    return addGroupModerator(req, res)
}


export function del(req, res) {
    return removeGroupModerator(req, res)
}


