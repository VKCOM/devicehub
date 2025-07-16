// autotests

import {addDevices} from '../../../controllers/autotests.js'

export function get(req, res) {
    return addDevices(req, res)
}


