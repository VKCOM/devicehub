// users

import {getUsers, deleteUsers} from '../controllers/users.js'

export function get(req, res, next) {
    return getUsers(req, res)
}


export function del(req, res, next) {
    return deleteUsers(req, res)
}


