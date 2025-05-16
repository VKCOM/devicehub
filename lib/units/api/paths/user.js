// user

import {getUser} from '../controllers/user.js'

export function get(req, res, next) {
    return getUser(req, res)
}


