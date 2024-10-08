// devices

import {getAdbRange} from '../../controllers/devices.js'

export function get(req, res, next) {
  return getAdbRange(req, res, next)
}


