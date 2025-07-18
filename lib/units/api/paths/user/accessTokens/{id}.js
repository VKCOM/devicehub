// user

import {getAccessToken, deleteAccessToken} from '../../../controllers/user.js'

export function get(req, res) {
    return getAccessToken(req, res)
}


export function del(req, res) {
    return deleteAccessToken(req, res)
}


