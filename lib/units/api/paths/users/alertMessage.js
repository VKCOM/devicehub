// users

import {getUsersAlertMessage, updateUsersAlertMessage} from '../../controllers/users.js'

export function get(req, res, next) {
    return getUsersAlertMessage(req, res, next)
}


export function put(req, res, next) {
    return updateUsersAlertMessage(req, res, next)
}


