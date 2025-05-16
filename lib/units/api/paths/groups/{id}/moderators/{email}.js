// groups
import {addGroupModerator, removeGroupModerator} from '../../../../controllers/groups.js'

export function put(req, res, next) {
    return addGroupModerator(req, res)
}

export function del(req, res, next) {
    return removeGroupModerator(req, res)
}
