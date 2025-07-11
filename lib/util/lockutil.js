import * as apiutil from './apiutil.js'
import dbapi from '../db/api.js'

export const unlockDevice = function(lock) {
    if (lock.device) {
        dbapi.unlockDevice(lock.device.serial)
    }
}
export const lockUser = function(email, res, lock) {
    return dbapi.lockUser(email)
        .then(function(stats) {
            return apiutil.computeStats(res, stats, 'user', lock)
        })
}
export const unlockUser = function(lock) {
    if (lock.user) {
        dbapi.unlockUser(lock.user.email)
    }
}

export const lockGenericDevice = function(req, res, lock, lockDevice) {
    return lockDevice(req.user.groups.subscribed,
     
        req.hasOwnProperty('body') ? req.body.serial : req.query.serial)
        .then(function(stats) {
            return apiutil.computeStats(res, stats, 'device', lock)
        })
}
export default {
    unlockDevice,
    lockUser,
    unlockUser,
    lockGenericDevice
}
