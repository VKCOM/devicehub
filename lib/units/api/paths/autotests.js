// autotests

import {captureDevices, freeDevices} from '../controllers/autotests.js'

export function get(req, res) {
    return captureDevices(req, res)
}


export function del(req, res) {
    return freeDevices(req, res)
}


