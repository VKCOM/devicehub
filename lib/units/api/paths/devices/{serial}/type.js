// devices

import {getDeviceType} from '../../../controllers/devices.js'

export function get(req, res, next) {
  return getDeviceType(req, res, next)
}


