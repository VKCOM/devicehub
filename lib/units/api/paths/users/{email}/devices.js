// users

import {getUserDevicesV2} from '../../../controllers/users.js'

export function get(req, res) {
    return getUserDevicesV2(req, res)
}


