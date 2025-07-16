// user

import {getUserDevices, addUserDevice} from '../../controllers/user.js'

export function get(req, res) {
    return getUserDevices(req, res)
}


export function post(req, res) {
    return addUserDevice(req, res)
}


