// users

import {getUserAccessToken, deleteUserAccessToken} from '../../../../controllers/users.js'

export function get(req, res, next) {
    return getUserAccessToken(req, res)
}


export function del(req, res, next) {
    return deleteUserAccessToken(req, res)
}


