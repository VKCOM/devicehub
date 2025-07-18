// user

import {addAdbPublicKey, removeAdbPublicKey} from '../../controllers/user.js'

export function post(req, res) {
    return addAdbPublicKey(req, res)
}


export function del(req, res) {
    return removeAdbPublicKey(req, res)
}


