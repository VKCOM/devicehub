// devices

import {addOriginGroupDevice, removeOriginGroupDevice} from '../../../../controllers/devices.js'

export function put(req, res, next) {
  return addOriginGroupDevice(req, res, next)
}


export function del(req, res, next) {
  return removeOriginGroupDevice(req, res, next)
}


