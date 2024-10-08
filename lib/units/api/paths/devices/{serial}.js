// devices

import {getDeviceBySerial, putDeviceBySerial, deleteDevice} from '../../controllers/devices.js'

export function get(req, res, next) {
  return getDeviceBySerial(req, res, next)
}


export function put(req, res, next) {
  return putDeviceBySerial(req, res, next)
}


export function del(req, res, next) {
  return deleteDevice(req, res, next)
}


