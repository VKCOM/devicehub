// user

import {getUserDeviceBySerial, addUserDeviceV2, deleteUserDeviceBySerial} from '../../../controllers/user.js'

export function get(req, res, next) {
    return getUserDeviceBySerial(req, res)
}


export function post(req, res, next) {
    return addUserDeviceV2(req, res)
}


export function del(req, res, next) {
    return deleteUserDeviceBySerial(req, res)
}


