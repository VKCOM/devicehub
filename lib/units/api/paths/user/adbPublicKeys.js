// user

import {addAdbPublicKey, removeAdbPublicKey} from '../../controllers/user.js'

export function post(req, res, next) {
    return addAdbPublicKey(req, res)
}


export function del(req, res, next) {
    return removeAdbPublicKey(req, res)
}


