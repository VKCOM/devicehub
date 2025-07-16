// user

import {remoteConnectUserDeviceBySerial, remoteDisconnectUserDeviceBySerial} from '../../../../controllers/user.js'

export function post(req, res) {
    return remoteConnectUserDeviceBySerial(req, res)
}


export function del(req, res) {
    return remoteDisconnectUserDeviceBySerial(req, res)
}


