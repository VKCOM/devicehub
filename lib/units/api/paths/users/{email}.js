// users

import {getUserByEmail, createUser, deleteUser} from '../../controllers/users.js'

export function get(req, res) {
    return getUserByEmail(req, res)
}


export function post(req, res) {
    return createUser(req, res)
}


export function del(req, res) {
    return deleteUser(req, res)
}


