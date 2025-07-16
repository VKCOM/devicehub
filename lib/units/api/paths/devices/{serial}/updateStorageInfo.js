// devices

import {updateStorageInfo} from '../../../controllers/devices.js'

export function put(req, res) {
    return updateStorageInfo(req, res)
}


