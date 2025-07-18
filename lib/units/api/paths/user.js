// user

import {getUser} from '../controllers/user.js'

export function get(req, res) {
    return getUser(req, res)
}


