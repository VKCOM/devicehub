// devices

import {updateStorageInfo} from '../../../controllers/devices.js'

export function put(req, res, next) {
    return updateStorageInfo(req, res)
}


