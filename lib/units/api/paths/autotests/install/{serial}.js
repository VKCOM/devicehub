// autotests

import {installOnDevice} from '../../../controllers/autotests.js'

export function post(req, res) {
    return installOnDevice(req, res)
}


