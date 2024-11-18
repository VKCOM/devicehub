// users

import {getUserDevicesV2} from '../../../controllers/users.js'

export function get(req, res, next) {
    return getUserDevicesV2(req, res, next)
}


