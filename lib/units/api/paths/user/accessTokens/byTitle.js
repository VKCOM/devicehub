// user

import {getAccessTokenByTitle} from '../../../controllers/user.js'

export function post(req, res) {
    return getAccessTokenByTitle(req, res)
}


