// users

import {remoteConnectUserDevice, remoteDisconnectUserDevice} from '../../../../../controllers/users.js'

export function post(req, res, next) {
    return remoteConnectUserDevice(req, res)
}


export function del(req, res, next) {
    return remoteDisconnectUserDevice(req, res)
}


