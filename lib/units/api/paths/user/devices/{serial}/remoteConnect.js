// user

import {remoteConnectUserDeviceBySerial, remoteDisconnectUserDeviceBySerial} from '../../../../controllers/user.js'

export function post(req, res, next) {
    return remoteConnectUserDeviceBySerial(req, res, next)
}


export function del(req, res, next) {
    return remoteDisconnectUserDeviceBySerial(req, res, next)
}


