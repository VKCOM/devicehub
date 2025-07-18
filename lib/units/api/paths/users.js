// users

import {getUsers, deleteUsers} from '../controllers/users.js'

export function get(req, res) {
    return getUsers(req, res)
}


export function del(req, res) {
    return deleteUsers(req, res)
}


