// autotests

import {useAndConnectDevice} from '../../controllers/autotests.js'

export function post(req, res, next) {
    return useAndConnectDevice(req, res, next)
}


