// users

import {getUserAccessTokensV2, createUserAccessToken, deleteUserAccessTokens} from '../../../controllers/users.js'

export function get(req, res, next) {
    return getUserAccessTokensV2(req, res, next)
}


export function post(req, res, next) {
    return createUserAccessToken(req, res, next)
}


export function del(req, res, next) {
    return deleteUserAccessTokens(req, res, next)
}


