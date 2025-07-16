// user

import {getUserDeviceBySerial, addUserDeviceV2, deleteUserDeviceBySerial} from '../../../controllers/user.js'

export function get(req, res) {
    return getUserDeviceBySerial(req, res)
}


export function post(req, res) {
    return addUserDeviceV2(req, res)
}


export function del(req, res) {
    return deleteUserDeviceBySerial(req, res)
}


