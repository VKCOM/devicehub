// devices

import {getDeviceOwner} from '../../../controllers/devices.js'

export function get(req, res, next) {
  return getDeviceOwner(req, res, next)
}


