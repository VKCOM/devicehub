// users

import {createServiceUser} from '../../../controllers/users.js'

export function post(req, res, next) {
  return createServiceUser(req, res, next)
}


