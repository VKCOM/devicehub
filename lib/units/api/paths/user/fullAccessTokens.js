// user

import {getAccessTokens} from '../../controllers/user.js'

export function get(req, res, next) {
    return getAccessTokens(req, res, next)
}


