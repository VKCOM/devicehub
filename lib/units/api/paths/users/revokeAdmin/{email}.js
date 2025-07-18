// users

import {revokeAdmin} from '../../../controllers/users.js'

export function del(req, res) {
    return revokeAdmin(req, res)
}


