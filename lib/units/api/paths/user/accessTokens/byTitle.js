// user

import {getAccessTokenByTitle} from '../../../controllers/user.js'

export function post(req, res, next) {
    return getAccessTokenByTitle(req, res, next)
}


