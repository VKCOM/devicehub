// users

import {getUsersAlertMessage, updateUsersAlertMessage} from '../../controllers/users.js'

export function get(req, res) {
    return getUsersAlertMessage(req, res)
}


export function put(req, res) {
    return updateUsersAlertMessage(req, res)
}


