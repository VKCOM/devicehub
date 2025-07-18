// users

import {remoteConnectUserDevice, remoteDisconnectUserDevice} from '../../../../../controllers/users.js'

export function post(req, res) {
    return remoteConnectUserDevice(req, res)
}


export function del(req, res) {
    return remoteDisconnectUserDevice(req, res)
}


