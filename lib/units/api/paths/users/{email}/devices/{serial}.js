// users

import {getUserDevice, addUserDeviceV3, deleteUserDevice} from '../../../../controllers/users.js'

export function get(req, res, next) {
  return getUserDevice(req, res, next)
}


export function post(req, res, next) {
  return addUserDeviceV3(req, res, next)
}


export function del(req, res, next) {
  return deleteUserDevice(req, res, next)
}


