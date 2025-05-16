// users

import {getUsersAlertMessage, updateUsersAlertMessage} from '../../controllers/users.js'

export function get(req, res, next) {
    return getUsersAlertMessage(req, res)
}


export function put(req, res, next) {
    return updateUsersAlertMessage(req, res)
}


