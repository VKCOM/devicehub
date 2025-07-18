// users

import {updateDefaultUserGroupsQuotas} from '../../controllers/users.js'

export function put(req, res) {
    return updateDefaultUserGroupsQuotas(req, res)
}


