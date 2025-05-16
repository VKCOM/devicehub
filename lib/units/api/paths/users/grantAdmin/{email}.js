// users

import {grantAdmin} from '../../../controllers/users.js'

export function post(req, res, next) {
    return grantAdmin(req, res)
}


