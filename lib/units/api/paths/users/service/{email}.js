// users

import {createServiceUser} from '../../../controllers/users.js'

export function post(req, res) {
    return createServiceUser(req, res)
}


