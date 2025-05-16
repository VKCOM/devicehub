// users

import {updateDefaultUserGroupsQuotas} from '../../controllers/users.js'

export function put(req, res, next) {
    return updateDefaultUserGroupsQuotas(req, res)
}


