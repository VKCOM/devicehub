// user

import {getAccessToken, deleteAccessToken} from '../../../controllers/user.js'

export function get(req, res, next) {
    return getAccessToken(req, res)
}


export function del(req, res, next) {
    return deleteAccessToken(req, res)
}


