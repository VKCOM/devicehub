import * as apiutil from './apiutil.js'
import * as dbapi from '../db/api.js'

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
export const lockGroupAndUser = function(req, res, lock) {
    return lockGroup(req, res, lock).then(function(lockingSuccessed) {
        return lockingSuccessed ?
            lockUser(req.user.email, res, lock) :
            false
    })
}
export const unlockGroupAndUser = function(lock) {
    unlockGroup(lock)
    unlockUser(lock)
}
export const lockGroup = function(req, res, lock) {
    const id = req.params.id
    const email = req.user.email
    return dbapi.lockGroupByOwner(email, id).then(function(stats) {
        return apiutil.computeStats(res, stats, 'group', lock)
    })
}
export const unlockGroup = function(lock) {
    if (lock.group) {
        dbapi.unlockGroup(lock.group.id)
    }
}
export const unlockGroupAndDevice = function(lock) {
    unlockGroup(lock)
    unlockDevice(lock)
}
export const lockGenericDevice = function(req, res, lock, lockDevice) {
    return lockDevice(req.user.groups.subscribed,
    // eslint-disable-next-line no-prototype-builtins
        req.hasOwnProperty('body') ? req.body.serial : req.query.serial)
        .then(function(stats) {
            return apiutil.computeStats(res, stats, 'device', lock)
        })
}
export default {
    unlockDevice
    , lockUser
    , unlockUser
    , lockGroupAndUser
    , unlockGroupAndUser
    , lockGroup
    , unlockGroup
    , unlockGroupAndDevice
    , lockGenericDevice
}
