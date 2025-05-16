// user

import {getUserAccessTokens, createAccessToken, deleteAccessTokens} from '../../controllers/user.js'

export function get(req, res, next) {
    return getUserAccessTokens(req, res)
}


export function post(req, res, next) {
    return createAccessToken(req, res)
}


export function del(req, res, next) {
    return deleteAccessTokens(req, res)
}


