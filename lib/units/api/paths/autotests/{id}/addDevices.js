// autotests

import {addDevices} from '../../../controllers/autotests.js'

export function get(req, res, next) {
    return addDevices(req, res)
}


