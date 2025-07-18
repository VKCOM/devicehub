// autotests

import {useAndConnectDevice} from '../../controllers/autotests.js'

export function post(req, res) {
    return useAndConnectDevice(req, res)
}


