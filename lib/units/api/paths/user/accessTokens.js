// user

import {getUserAccessTokens, createAccessToken, deleteAccessTokens} from '../../controllers/user.js'

export function get(req, res) {
    return getUserAccessTokens(req, res)
}


export function post(req, res) {
    return createAccessToken(req, res)
}


export function del(req, res) {
    return deleteAccessTokens(req, res)
}


