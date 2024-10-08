// devices

import {getDeviceGroups} from '../../../controllers/devices.js'

export function get(req, res, next) {
  return getDeviceGroups(req, res, next)
}


