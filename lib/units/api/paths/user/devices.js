// user

import {getUserDevices, addUserDevice} from '../../controllers/user.js'

export function get(req, res, next) {
    return getUserDevices(req, res, next)
}


export function post(req, res, next) {
    return addUserDevice(req, res, next)
}


