// autotests

import {installOnDevice} from '../../../controllers/autotests.js'

export function post(req, res, next) {
    return installOnDevice(req, res)
}


