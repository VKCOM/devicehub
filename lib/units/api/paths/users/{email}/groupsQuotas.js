// users

import {updateUserGroupsQuotas} from '../../../controllers/users.js'

export function put(req, res, next) {
  return updateUserGroupsQuotas(req, res, next)
}


