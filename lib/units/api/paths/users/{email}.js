// users

import {getUserByEmail, createUser, deleteUser} from '../../controllers/users.js'

export function get(req, res, next) {
    return getUserByEmail(req, res)
}


export function post(req, res, next) {
    return createUser(req, res)
}


export function del(req, res, next) {
    return deleteUser(req, res)
}


