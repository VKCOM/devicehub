// groups

import {getGroupUsers, addGroupUsers, removeGroupUsers} from '../../../controllers/groups.js'

export function get(req, res, next) {
  return getGroupUsers(req, res, next)
}


export function put(req, res, next) {
  return addGroupUsers(req, res, next)
}


export function del(req, res, next) {
  return removeGroupUsers(req, res, next)
}


