import * as Sentry from '@sentry/node'
import Promise from 'bluebird'
import logger from '../../../util/logger.js'
import * as apiutil from '../../../util/apiutil.js'
import * as db from '../../../db/index.js'
import * as dbapi from '../../../db/api.js'
export default (function() {
    const log = logger.createLogger('groups-scheduler')
    function updateOriginGroupLifetime(group) {
        const lock = {}
        return dbapi.adminLockGroup(group.id, lock).then(function(lockingSuccessed) {
            if (lockingSuccessed) {
                const now = Date.now()
                return db.connect().then(client => {
                    return client.collection('groups').updateOne({id: group.id}, {
                        $set: {
                            dates: [{
                                start: new Date(now)
                                , stop: new Date(now + (group.dates[0].stop - group.dates[0].start))
                            }]
                        }
                    })
                })
            }
            return false
        })
            .finally(function() {
                return dbapi.adminUnlockGroup(lock)
            })
    }
    function deleteUserGroup(group) {
        const lock = {}
        return dbapi.adminLockGroup(group.id, lock).then(function(lockingSuccessed) {
            if (lockingSuccessed) {
                return dbapi.deleteUserGroup(group.id)
            }
            else {
                return db.connect().then(client => {
                    return client.collection('groups').updateOne({id: group.id}, {
                        $set: {
                            isActive: false
                            , state: apiutil.WAITING
                        }
                    })
                })
            }
        })
            .finally(function() {
                return dbapi.adminUnlockGroup(lock)
            })
    }
    function updateGroupDates(group, incr, isActive) {
        const repetitions = group.repetitions - incr
        const dates = group.dates.slice(incr)
        const duration = group.devices.length * (dates[0].stop - dates[0].start) * (repetitions + 1)
        return db.connect().then(client => {
            return client.collection('groups').updateOne({id: group.id}, {
                $set: {
                    dates: dates
                    , repetitions: repetitions
                    , duration: duration
                    , isActive: isActive
                    , state: apiutil.READY
                }
            })
        })
            .then(function() {
                return dbapi.updateUserGroupDuration(group.owner.email, group.duration, duration)
            })
    }
    function doBecomeUnactiveGroup(group) {
        const lock = {}
        return dbapi.adminLockGroup(group.id, lock).then(function(lockingSuccessed) {
            if (lockingSuccessed) {
                return updateGroupDates(group, 1, false)
            }
            else {
                return db.connect().then(client => {
                    return client.collection('groups').updateOne({id: group.id}, {
                        $set: {
                            isActive: false
                            , state: apiutil.WAITING
                        }
                    })
                })
            }
        })
            .finally(function() {
                return dbapi.adminUnlockGroup(lock)
            })
    }
    function doCleanElapsedGroupDates(group, incr) {
        const lock = {}
        return dbapi.adminLockGroup(group.id, lock).then(function(lockingSuccessed) {
            return lockingSuccessed ? updateGroupDates(group, incr, false) : false
        })
            .finally(function() {
                return dbapi.adminUnlockGroup(lock)
            })
    }
    function doBecomeActiveGroup(group, incr) {
        const lock = {}
        return dbapi.adminLockGroup(group.id, lock).then(function(lockingSuccessed) {
            return lockingSuccessed ? updateGroupDates(group, incr, true) : false
        })
            .finally(function() {
                return dbapi.adminUnlockGroup(lock)
            })
    }
    dbapi.unlockBookingObjects().then(function() {
        setInterval(() => {
            Sentry.startSpan({name: 'groups-engine scheduler'}, () => {
                const now = Date.now()
                log.info(`groups-engine tick. now: ${now}`)
                dbapi.getReadyGroupsOrderByIndex('startTime').then(function(groups) {
                    Promise.each(groups, (function(group) {
                        if (apiutil.isOriginGroup(group.class)) {
                            if (now >= group.dates[0].stop.getTime()) {
                                return updateOriginGroupLifetime(group)
                            }
                        }
                        else if ((group.isActive || group.state === apiutil.WAITING) &&
                        now >= group.dates[0].stop.getTime()) {
                            if (group.dates.length === 1 || (group.class === apiutil.ONCE && group.devices.length === 0)) {
                                return deleteUserGroup(group)
                            }
                            else {
                                return doBecomeUnactiveGroup(group)
                            }
                        }
                        else if (!group.isActive) {
                            for (const i in group.dates) {
                                if (now >= group.dates[i].stop.getTime()) {
                                    if (group.dates[i].stop === group.dates[group.dates.length - 1].stop) {
                                        return deleteUserGroup(group)
                                    }
                                }
                                else if (now < group.dates[i].start.getTime()) {
                                    return i > 0 ? doCleanElapsedGroupDates(group, i) : false
                                }
                                else {
                                    return doBecomeActiveGroup(group, i)
                                }
                            }
                        }
                        return false
                    }))
                })
                    .catch(function(err) {
                        Sentry.captureException(err)

                        log.error('An error occured during groups scheduling', err.stack)
                    })
            })
        }, 1000)
    })
    setInterval(() => {
        dbapi.generateIndexes()
    }, apiutil.ONE_HOUR * 8)
})
