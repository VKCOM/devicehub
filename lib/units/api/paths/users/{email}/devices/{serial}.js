// users

import {getUserDevice, addUserDeviceV3, deleteUserDevice} from '../../../../controllers/users.js'

export function get(req, res, next) {
    return getUserDevice(req, res)
}


export function post(req, res, next) {
    return addUserDeviceV3(req, res)
}


export function del(req, res, next) {
    return deleteUserDevice(req, res)
}


