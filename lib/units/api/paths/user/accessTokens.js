// user

import {getUserAccessTokens, createAccessToken, deleteAccessTokens} from '../../controllers/user.js'

export function get(req, res, next) {
    return getUserAccessTokens(req, res, next)
}


export function post(req, res, next) {
    return createAccessToken(req, res, next)
}


export function del(req, res, next) {
    return deleteAccessTokens(req, res, next)
}


