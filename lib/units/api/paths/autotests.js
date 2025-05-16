// autotests

import {captureDevices, freeDevices} from '../controllers/autotests.js'

export function get(req, res, next) {
    return captureDevices(req, res)
}


export function del(req, res, next) {
    return freeDevices(req, res)
}


