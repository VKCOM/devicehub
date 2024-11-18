// users

import {revokeAdmin} from '../../../controllers/users.js'

export function del(req, res, next) {
    return revokeAdmin(req, res, next)
}


