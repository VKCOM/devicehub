// users

import {getUserAccessToken, deleteUserAccessToken} from '../../../../controllers/users.js'

export function get(req, res) {
    return getUserAccessToken(req, res)
}


export function del(req, res) {
    return deleteUserAccessToken(req, res)
}


