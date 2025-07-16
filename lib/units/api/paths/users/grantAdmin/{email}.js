// users

import {grantAdmin} from '../../../controllers/users.js'

export function post(req, res) {
    return grantAdmin(req, res)
}


