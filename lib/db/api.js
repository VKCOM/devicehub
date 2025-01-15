/* eslint-disable valid-jsdoc */
/**
 * Copyright © 2024 contains code contributed by V Kontakte LLC, authors: Daniil Smirnov, Egor Platonov, Aleksey Chistov - Licensed under the Apache license 2.0
 **/
import util from 'util'
import db from './index.js'
import wireutil from '../wire/util.js'
import {v4 as uuidv4} from 'uuid'
import * as apiutil from '../util/apiutil.js'
import * as Sentry from '@sentry/node'
import Promise from 'bluebird'
import _ from 'lodash'

import logger from '../util/logger.js'
import {AssertionError} from 'assert'

const log = logger.createLogger('dbapi')

// const dbapi = Object.create(null)

// constant default device data

const DEFAULT_IOS_DEVICE_ARGS = {
    DENSITY: 2
    , FPS: 60
    , ID: 0
    , ROTATION: 0
    , SECURE: true
    , SIZE: 4.971253395080566
    , XDPI: 294.9670104980469
    , YDPI: 295.56298828125
}

//

// dbapi.DuplicateSecondaryIndexError = function DuplicateSecondaryIndexError() {
export const DuplicateSecondaryIndexError = function DuplicateSecondaryIndexError() {
    Error.call(this)
    this.name = 'DuplicateSecondaryIndexError'
    Error.captureStackTrace(this, DuplicateSecondaryIndexError)
}

util.inherits(DuplicateSecondaryIndexError, Error)


const trace = (name, args, fn) => {
    const addedAttributes = Object.fromEntries(Object.entries(args).map(([k, v]) => (
        ['dbapi.' + k, v]
    )))
    return Sentry.startSpan({op: 'dbapi', name, attributes: addedAttributes}, fn)
}

/**
 * @deprecated Do not use locks in database.
 */
export const unlockBookingObjects = function() {
    return trace('unlockBookingObjects', {}, () => {
        return db.connect().then(client => {
            return Promise.all([
                client.collection('users').updateMany(
                    {},
                    {
                        $set: {'groups.lock': false}
                    }
                )
                , client.collection('devices').updateMany(
                    {},
                    {
                        $set: {'group.lock': false}
                    }
                )
                , client.collection('groups').updateMany(
                    {},
                    {
                        $set: {
                            'lock.user': false
                            , 'lock.admin': false
                        }
                    }
                )
            ])
        })
    })
}

// dbapi.getNow = function() {
export const getNow = function() {
    return trace('getNow', {}, () => {
        return new Date()
    })
}


// dbapi.createBootStrap = function(env) {
export const createBootStrap = function(env) {
    return trace('createBootStrap', {env}, () => {
        const now = Date.now()

        function updateUsersForMigration(group) {
            return getUsers().then(function(users) {
                return Promise.map(users, function(user) {
                    return db.connect().then(client => {
                        let data = {
                            privilege: user.email !== group.owner.email ? apiutil.USER : apiutil.ADMIN
                            , 'groups.subscribed': []
                            , 'groups.lock': false
                            , 'groups.quotas.allocated.number': group.envUserGroupsNumber
                            , 'groups.quotas.allocated.duration': group.envUserGroupsDuration
                            , 'groups.quotas.consumed.duration': 0
                            , 'groups.quotas.consumed.number': 0
                            , 'groups.defaultGroupsNumber': user.email !== group.owner.email ? 0 : group.envUserGroupsNumber
                            , 'groups.defaultGroupsDuration': user.email !== group.owner.email ? 0 : group.envUserGroupsDuration
                            , 'groups.defaultGroupsRepetitions': user.email !== group.owner.email ? 0 : group.envUserGroupsRepetitions
                            , 'groups.repetitions': group.envUserGroupsRepetitions
                        }
                        client.collection('users').updateOne(
                            {email: user.email},
                            {
                                $set: data
                            }
                        )
                            .then(function(stats) {
                                if (stats.modifiedCount > 0) {
                                    return addGroupUser(group.id, user.email)
                                }
                                return stats
                            })
                    })
                })
            })
        }

        function getDevices() {
            return db.connect().then(client => {
                return client.collection('devices').find().toArray()
            })
        }

        function updateDevicesForMigration(group) {
            return getDevices().then(function(devices) {
                return Promise.map(devices, function(device) {
                    log.info('Migrating device ' + device.serial)
                    return db.connect().then(client => {
                        let data = {
                            'group.id': group.id
                            , 'group.name': group.name
                            , 'group.lifeTime': group.lifeTime
                            , 'group.owner': group.owner
                            , 'group.origin': group.origin
                            , 'group.class': group.class
                            , 'group.repetitions': group.repetitions
                            , 'group.originName': group.originName
                            , 'group.lock': false
                        }
                        return client.collection('devices').updateOne(
                            {serial: device.serial},
                            {
                                $set: data
                            }
                        ).then(function(stats) {
                            if (stats.modifiedCount > 0) {
                                return addOriginGroupDevice(group, device.serial)
                            }
                            return stats
                        })
                    })
                })
            })
        }

        return createGroup({
            name: env.STF_ROOT_GROUP_NAME
            , owner: {
                email: env.STF_ADMIN_EMAIL
                , name: env.STF_ADMIN_NAME
            }
            , users: [env.STF_ADMIN_EMAIL]
            , privilege: apiutil.ROOT
            , class: apiutil.BOOKABLE
            , repetitions: 0
            , duration: 0
            , isActive: true
            , state: apiutil.READY
            , dates: [{
                start: new Date(now)
                , stop: new Date(now + apiutil.TEN_YEARS)
            }]
            , envUserGroupsNumber: apiutil.MAX_USER_GROUPS_NUMBER
            , envUserGroupsDuration: apiutil.MAX_USER_GROUPS_DURATION
            , envUserGroupsRepetitions: apiutil.MAX_USER_GROUPS_REPETITIONS
        })
            .then(function(group) {
                return saveUserAfterLogin({
                    name: group.owner.name
                    , email: group.owner.email
                    , ip: '127.0.0.1'
                })
                    .then(function() {
                        return updateUsersForMigration(group)
                    })
                    .then(function() {
                        return updateDevicesForMigration(group)
                    })
                    .then(function() {
                        return reserveUserGroupInstance(group.owner.email)
                    })
            })
    })
}

// dbapi.deleteDevice = function(serial) {
export const deleteDevice = function(serial) {
    return trace('deleteDevice', {serial}, () => {
        return db.connect().then(client => {
            return client.collection('devices').deleteOne({serial: serial})
        })
    })
}

export const deleteUser = function(email) {
    return trace('deleteUser', {email}, () => {
        return db.connect().then(client => {
            return client.collection('users').deleteOne({email: email})
        })
    })
}

export const getReadyGroupsOrderByIndex = function(index) {
    return trace('getReadyGroupsOrderByIndex', {index}, () => {
        const options = {
        // Sort matched documents in descending order by rating
            sort: [index],
        }
        return db.connect().then(client => {
            return client.collection('groups')
                .find(
                    {
                        state:
                {
                    $ne: apiutil.PENDING
                }
                    }
                    , options
                )
                .toArray()
        })
    })
}

// dbapi.getGroupsByIndex = function(value, index) {
export const getGroupsByIndex = function(value, index) {
    return trace('getGroupsByIndex', {value, index}, () => {
        let findIndex = {}
        findIndex[index] = value
        return db.connect().then(client => {
            return client.collection('groups').find(findIndex).toArray()
        })
    })
}


// dbapi.getGroupByIndex = function(value, index) {
export const getGroupByIndex = function(value, index) {
    return trace('getGroupByIndex', {value, index}, () => {
        return getGroupsByIndex(value, index)
            .then(function(array) {
                return array[0]
            })
    })
}

// dbapi.getGroupsByUser = function(email) {
export const getGroupsByUser = function(email) {
    return trace('getGroupsByUser', {email}, () => {
        return db.connect().then(client => {
            return client.collection('groups').find({users: {$in: [email]}}).toArray()
        })
    })
}

// dbapi.getGroup = function(id) {
export const getGroup = function(id) {
    return trace('getGroup', {id}, () => {
        return db.connect().then(client => {
            return client.collection('groups').findOne({id: id})
        })
    })
}

// dbapi.getGroups = function() {
export const getGroups = function() {
    return trace('getGroups', {}, () => {
        return db.connect().then(client => {
            return client.collection('groups').find().toArray()
        })
    })
}

// dbapi.getUsers = function() {
export const getUsers = function() {
    return trace('getUsers', {}, () => {
        return db.connect().then(client => {
            return client.collection('users').find().toArray()
        })
    })
}

// dbapi.getEmails = function() {
export const getEmails = function() {
    return trace('getEmails', {}, () => {
        return db.connect().then(client => {
            return client.collection('users')
                .find(
                    {
                        privilege:
                {
                    $ne: apiutil.ADMIN
                }
                    }
                )
                .project({email: 1, _id: 0})
                .toArray()
        })
    })
}

// dbapi.addGroupUser = function(id, email) {
export const addGroupUser = function(id, email) {
    return trace('addGroupUser', {id, email}, () => {
        return db.connect()
            .then(client => {
                return Promise.all([
                    client.collection('groups').updateOne(
                        {
                            id: id
                        },
                        {
                            $addToSet: {
                                users: email
                            }
                        }
                    )
                    , client.collection('users').updateOne(
                        {
                            email: email
                        },
                        {
                            $addToSet: {
                                'groups.subscribed': id
                            }
                        }
                    )
                ])
            })
            .catch((e) => {
                if (e instanceof TypeError) {
                    log.error('User with email ' + email + " doesn't exist")
                    return 'User with email ' + email + " doesn't exist"
                }
            })
            .then(function(stats) {
                return stats[0].modifiedCount === 0 && stats[1].modifiedCount === 0 ? 'unchanged ' + email : 'added ' + email
            })
    })
}

// dbapi.getAdmins = function() {
export const getAdmins = function() {
    return trace('getAdmins', {}, () => {
        return db.connect().then(client => {
            return client.collection('users')
                .find({
                    privilege: apiutil.ADMIN
                })
                .project({email: 1, _id: 0})
                .toArray()
        })
    })
}


// dbapi.addAdminsToGroup = function(id) {
export const addAdminsToGroup = function(id) {
    return trace('addAdminsToGroup', {id}, () => {
        return getAdmins().then(admins => {
            return db.connect().then(client => {
                return client.collection('groups').findOne({id: id}).then(group => {
                    admins.forEach((admin) => {
                        let newUsers = group.users
                        if (!newUsers.includes(admin.email)) {
                            newUsers.push(admin.email)
                        }
                        return client.collection('groups').updateOne(
                            {
                                id: id
                            },
                            {
                                $set: {
                                    users: newUsers
                                }
                            }
                        ).then(() => {
                            return client.collection('users').findOne({email: admin.email})
                                .then(user => {
                                    let newSubs = user.groups.subscribed
                                    newSubs.push(id)
                                    return client.collection('users').updateOne(
                                        {email: admin.email},
                                        {
                                            $set: {
                                                'groups.subscribed': newSubs
                                            }
                                        }
                                    )
                                })
                        })
                    })
                })
            })
        })
    })
}

// dbapi.removeGroupUser = function(id, email) {
export const removeGroupUser = function(id, email) {
    return trace('removeGroupUser', {id, email}, () => {
        return db.connect().then(client => {
            return Promise.all([
                client.collection('groups').updateOne(
                    {id: id}
                    , {
                        $pull: {
                            users: email
                        }
                    }
                )
                , client.collection('users').updateOne(
                    {email: email}
                    ,
                    {
                        $pull: {'groups.subscribed': id}
                    }
                )
            ])
        })
            .then(function() {
                return 'deleted'
            })
    })
}

export const lockDeviceByCurrent = function(groups, serial) {
    return trace('lockDeviceByCurrent', {groups, serial}, () => {
        function wrappedlockDeviceByCurrent() {
            return db.connect().then(client => {
                return client.collection('devices').findOne({serial: serial}).then(oldDoc => {
                    return client.collection('devices').updateOne(
                        {serial: serial},
                        [{
                            $set: {
                                'group.lock': {
                                    $cond: [
                                        {
                                            $and: [
                                                {$eq: ['$group.lock', false]}
                                                , {$not: [{$eq: [{$setIntersection: [groups, ['$group.id']]}, []]}]}
                                            ]
                                        }
                                        , true
                                        , '$group.lock'
                                    ]
                                }
                            }
                        }]
                    ).then(updateStats => {
                        return client.collection('devices').findOne({serial: serial}).then(newDoc => {
                            updateStats.changes = [
                                {new_val: {...newDoc}, old_val: {...oldDoc}}
                            ]
                            return updateStats
                        })
                    })
                })
            })
                .then(function(stats) {
                    return apiutil.lockDeviceResult(stats, loadDeviceByCurrent, groups, serial)
                })
        }

        return apiutil.setIntervalWrapper(
            wrappedlockDeviceByCurrent
            , 10
            , Math.random() * 500 + 50)
    })
}

// dbapi.lockDeviceByOrigin = function(groups, serial) {
export const lockDeviceByOrigin = function(groups, serial) {
    return trace('lockDeviceByOrigin', {groups, serial}, () => {
        function wrappedlockDeviceByOrigin() {
            return db.connect().then(client => {
                return client.collection('devices').findOne({serial: serial}).then(oldDoc => {
                    return client.collection('devices').updateOne(
                        {serial: serial},
                        [{
                            $set: {
                                'group.lock': {
                                    $cond: [
                                        {
                                            $and: [
                                                {$eq: ['$group.lock', false]}
                                                , {$not: [{$eq: [{$setIntersection: [groups, ['$group.origin']]}, []]}]}
                                            ]
                                        }
                                        , true
                                        , '$group.lock'
                                    ]
                                }
                            }
                        }]
                    ).then(updateStats => {
                        return client.collection('devices').findOne({serial: serial}).then(newDoc => {
                            updateStats.changes = [
                                {new_val: {...newDoc}, old_val: {...oldDoc}}
                            ]
                            return updateStats
                        })
                    })
                })
            })
                .then(function(stats) {
                    return apiutil.lockDeviceResult(stats, loadDeviceByOrigin, groups, serial)
                })
        }

        return apiutil.setIntervalWrapper(
            wrappedlockDeviceByOrigin
            , 10
            , Math.random() * 500 + 50)
    })
}

// dbapi.addOriginGroupDevice = function(group, serial) {
export const addOriginGroupDevice = function(group, serial) {
    return trace('addOriginGroupDevice', {group, serial}, () => {
        return db.connect().then(client => {
            return client.collection('groups').findOne({id: group.id}).then((groupData) => {
                let devices = groupData.devices
                if (!devices.includes(serial)) {
                    devices.push(serial)
                }
                else {
                    return getGroup(group.id)
                }
                return client.collection('groups').updateOne(
                    {
                        id: group.id
                    },
                    {
                        $set: {
                            devices: devices
                        }
                    }).then(function() {
                    return getGroup(group.id)
                })
            })
        })
    })
}

// dbapi.removeOriginGroupDevice = function(group, serial) {
export const removeOriginGroupDevice = function(group, serial) {
    return trace('removeOriginGroupDevice', {group, serial}, () => {
        return db.connect().then(client => {
            return client.collection('groups').updateOne(
                {id: group.id}
                , [
                    {$set: {devices: {$setDifference: ['$devices', [serial]]}}}
                ]
            )
                .then(function() {
                    return getGroup(group.id)
                })
        })
    })
}

// dbapi.addGroupDevices = function(group, serials) {
export const addGroupDevices = function(group, serials) {
    return trace('addGroupDevices', {group, serials}, () => {
        const duration = apiutil.computeDuration(group, serials.length)

        return updateUserGroupDuration(group.owner.email, group.duration, duration)
            .then(function(stats) {
                if (stats.modifiedCount > 0) {
                    return updateGroup(
                        group.id
                        , {
                            duration: duration
                            , devices: _.union(group.devices, serials)
                        })
                        .then((data) => {
                            if (group.class === apiutil.ONCE) {
                                return updateDevicesCurrentGroup(serials, group)
                                    .then(() => data)
                            }
                            return data
                        })
                }
                return Promise.reject('quota is reached')
            })
    })
}

// dbapi.removeGroupDevices = function(group, serials) {
export const removeGroupDevices = function(group, serials) {
    return trace('removeGroupDevices', {group, serials}, () => {
        const duration = apiutil.computeDuration(group, -serials.length)

        return updateUserGroupDuration(group.owner.email, group.duration, duration)
            .then(function() {
                return updateGroup(
                    group.id
                    , {
                        duration: duration
                        , devices: _.difference(group.devices, serials)
                    })
            })
    })
}

/**
 * @deprecated Do not use locks in database.
 */
function setLockOnDevice(serial, state) {
    return db.connect().then(client => {
        return client.collection('devices').findOne({serial: serial}).then(device => {
            return client.collection('devices').updateOne({
                serial: serial
            }
            ,
            {
                $set: {'group.lock': device.group.lock !== state ? state : device.group.lock}
            }
            )
        })
    })
}

/**
 * @deprecated Do not use locks in database.
 */
export const lockDevice = function(serial) {
    return trace('lockDevice', {serial}, () => {
        return setLockOnDevice(serial, true)
    })
}

/**
 * @deprecated Do not use locks in database.
 */
export const lockDevices = function(serials) {
    return trace('lockDevices', {serials}, () => {
        return setLockOnDevices(serials, true)
    })
}

// dbapi.unlockDevice = function(serial) {
export const unlockDevice = function(serial) {
    return trace('unlockDevice', {serial}, () => {
        return setLockOnDevice(serial, false)
    })
}

// dbapi.unlockDevices = function(serials) {
export const unlockDevices = function(serials) {
    return trace('unlockDevices', {serials}, () => {
        return setLockOnDevices(serials, false)
    })
}

/**
 * @deprecated Do not use locks in database.
 */
export const setLockOnDevices = function(serials, lock) {
    return trace('setLockOnDevices', {serials, lock}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateMany(
                {serial: {$in: serials}}
                , {
                    $set: {
                        'group.lock': lock
                    }
                }
            )
        })
    })
}

/**
 * @deprecated Do not use locks in database.
 */
function setLockOnUser(email, state) {
    return db.connect().then(client => {
        return client.collection('users').findOne({email: email}).then(oldDoc => {
            return client.collection('users').updateOne({
                email: email
            }
            ,
            {
                $set: {'groups.lock': oldDoc.groups.lock !== state ? state : oldDoc.groups.lock}
            }
            )
                .then(updateStats => {
                    return client.collection('users').findOne({email: email}).then(newDoc => {
                        updateStats.changes = [
                            {new_val: {...newDoc}, old_val: {...oldDoc}}
                        ]
                        return updateStats
                    })
                })
        })
    })
}

// dbapi.lockUser = function(email) {
export const lockUser = function(email) {
    return trace('lockUser', {email}, () => {
        function wrappedlockUser() {
            return setLockOnUser(email, true)
                .then(function(stats) {
                    return apiutil.lockResult(stats)
                })
        }

        return apiutil.setIntervalWrapper(
            wrappedlockUser
            , 10
            , Math.random() * 500 + 50)
    })
}

// dbapi.unlockUser = function(email) {
export const unlockUser = function(email) {
    return trace('unlockUser', {email}, () => {
        return setLockOnUser(email, false)
    })
}

/**
 * @deprecated Do not use locks in database.
 */
export const lockGroupByOwner = function(email, id) {
    return trace('lockGroupByOwner', {email, id}, () => {
        async function wrappedlockGroupByOwner() {
            return db.connect().then(async client => {
                const rootGroup = await getRootGroup()
                const triggeredUser = await client.collection('users').findOne({email: email})
                const group = await client.collection('groups').findOne({id: id})
                if (!group) {
                    return {
                        modifiedCount: 0
                        , matchedCount: 0
                    }
                }
                if (!(group.owner.email === email || rootGroup.owner.email === email || triggeredUser.privilege === apiutil.ADMIN)) {
                    return {modifiedCount: 0, matchedCount: 1, changes: [
                        {new_val: {...group}, old_val: {...group}}
                    ]}
                }
                const updateStats = await client.collection('groups').updateOne({
                    id: id
                    , 'lock.user': false
                    , 'lock.admin': false
                },
                {
                    $set: {
                        'lock.user': true
                    }
                })
                const newDoc = await client.collection('groups').findOne({id: id})
                updateStats.changes = [
                    {new_val: {...newDoc}, old_val: {...group}}
                ]
                return updateStats
            })
                .then(function(stats) {
                    const result = apiutil.lockResult(stats)

                    if (!result.status) {
                        return getGroupAsOwnerOrAdmin(email, id).then(function(group) {
                            if (!group) { // If group doen't exist or it's not our
                                result.data.locked = false
                                result.status = true
                            }
                            log.info(`lockGroupByOwner ${email}, ${id} results: ${result}`)
                            return result
                        })
                    }
                    log.info(`lockGroupByOwner ${email}, ${id} results 2: ${result}`)
                    return result
                })
        }

        return apiutil.setIntervalWrapper(
            wrappedlockGroupByOwner
            , 10
            , Math.random() * 500 + 50)
    })
}

/**
 * @deprecated Do not use locks in database.
 */
export const lockGroup = function(id) {
    return trace('lockGroup', {id}, () => {
        function wrappedlockGroup() {
            return db.connect().then(client => {
                return client.collection('groups').updateOne(
                    {
                        id: id
                        , 'lock.user': false
                        , 'lock.admin': false
                    },
                    {
                        $set: {
                            'lock.user': true
                        }
                    }
                ).then(function(stats) {
                    return apiutil.lockResult(stats)
                })
            })
        }

        return apiutil.setIntervalWrapper(
            wrappedlockGroup
            , 10
            , Math.random() * 500 + 50)
    })
}

/**
 * @deprecated Do not use locks in database.
 */
export const unlockGroup = function(id) {
    return trace('unlockGroup', {id}, () => {
        return db.connect().then(client => {
            return client.collection('groups').updateMany(
                {id: id},
                {
                    $set: {
                        'lock.user': false
                    }
                }
            )
        })
    })
}

/**
 * @deprecated Do not use locks in database.
 */
export const adminLockGroup = function(id, lock) {
    return trace('adminLockGroup', {id, lock}, () => {
        function wrappedAdminLockGroup() {
            return db.connect().then(client => {
                return client.collection('groups').findOneAndUpdate({
                    id: id
                    , 'lock.user': false
                    , 'lock.admin': false
                },
                {
                    $set: {
                        'lock.user': false
                        , 'lock.admin': true
                    }
                },
                {
                    returnDocument: 'after'
                }).then(function(group) {
                    if (group === null) {
                        return {status: false, data: false}
                    }
                    lock.group = group
                    return {status: true, data: true}
                })
            })
        }

        return apiutil.setIntervalWrapper(
            wrappedAdminLockGroup
            , 10
            , Math.random() * 500 + 50)
    })
}

/**
 * @deprecated Do not use locks in database.
 */
export const adminUnlockGroup = function(lock) {
    return trace('adminUnlockGroup', {lock}, () => {
        if (lock.group) {
            return db.connect().then(client => {
                return client.collection('groups').updateOne(
                    {
                        id: lock.group.id
                    }
                    , {
                        $set: {
                            'lock.user': false
                            , 'lock.admin': false
                        }
                    }
                )
            })
        }
        return true
    })
}

// dbapi.getRootGroup = function() {
export const getRootGroup = function() {
    return trace('getRootGroup', {}, () => {
        return getGroupByIndex(apiutil.ROOT, 'privilege').then(function(group) {
            if (!group) {
                throw new Error('Root group not found')
            }
            return group
        })
    })
}

// dbapi.getUserGroup = function(email, id) {
export const getUserGroup = function(email, id) {
    return trace('getUserGroup', {email, id}, () => {
        return db.connect().then(client => {
            return client.collection('groups').find({
                users: {$in: [email]}
                , id: id
            }).toArray().then(groups => {
                return groups[0]
            })
        })
    })
}

// dbapi.getUserGroups = function(email) {
export const getUserGroups = function(email) {
    return trace('getUserGroups', {email}, () => {
        return db.connect().then(client => {
            return client.collection('groups').find({users: {$in: [email]}}).toArray()
        })
    })
}

// dbapi.getOnlyUserGroups = function(email) {
export const getOnlyUserGroups = function(email) {
    return trace('getOnlyUserGroups', {email}, () => {
        return db.connect().then(client => {
            return client.collection('groups').find({
                users: {$in: [email]}
                , 'owner.email': {$ne: email}
            }).toArray()
        })
    })
}

// dbapi.getTransientGroups = function() {
export const getTransientGroups = function() {
    return trace('getTransientGroups', {}, () => {
        return db.connect().then(client => {
            return client.collection('groups').find({
                class: {$nin: [apiutil.BOOKABLE, apiutil.STANDARD]}
            }
            ).toArray()
        })
    })
}

// dbapi.getDeviceTransientGroups = function(serial) {
export const getDeviceTransientGroups = function(serial) {
    return trace('getDeviceTransientGroups', {serial}, () => {
        return db.connect().then(client => {
            return client.collection('groups').find({
                devices: serial
                , class: {$nin: [apiutil.BOOKABLE, apiutil.STANDARD]}
            }
            ).toArray()
        })
    })
}

// dbapi.isDeviceBooked = function(serial) {
export const isDeviceBooked = function(serial) {
    return trace('isDeviceBooked', {serial}, () => {
        return getDeviceTransientGroups(serial)
            .then(function(groups) {
                return groups.length > 0
            })
    })
}

// dbapi.isRemoveGroupUserAllowed = function(email, targetGroup) {
export const isRemoveGroupUserAllowed = function(email, targetGroup) {
    return trace('isRemoveGroupUserAllowed', {email, targetGroup}, () => {
        if (targetGroup.class !== apiutil.BOOKABLE) {
            return Promise.resolve(true)
        }
        return db.connect().then(client => {
            return client.collection('groups').aggregate([
                {$match: {'owner.email': email}}
                , {
                    $match: {
                        $and: [
                            {$ne: ['$class', apiutil.BOOKABLE]}
                            , {$ne: ['$class', apiutil.STANDARD]}
                            , {$not: [{$eq: [{$setIntersection: [targetGroup.devices, ['$devices']]}, []]}]}
                        ]
                    }
                }
            ]).toArray()
        })
            .then(function(groups) {
                return groups.length === 0
            })
    })
}

// dbapi.isUpdateDeviceOriginGroupAllowed = function(serial, targetGroup) {
export const isUpdateDeviceOriginGroupAllowed = function(serial, targetGroup) {
    return trace('isUpdateDeviceOriginGroupAllowed', {serial, targetGroup}, () => {
        return getDeviceTransientGroups(serial)
            .then(function(groups) {
                if (groups.length) {
                    if (targetGroup.class === apiutil.STANDARD) {
                        return false
                    }
                    for (const group of groups) {
                        if (targetGroup.users.indexOf(group.owner.email) < 0) {
                            return false
                        }
                    }
                }
                return true
            })
    })
}

// dbapi.getDeviceGroups = function(serial) {
export const getDeviceGroups = function(serial) {
    return trace('getDeviceGroups', {serial}, () => {
        return db.connect().then(client => {
            return client.collection('groups').find({
                devices: {$in: [serial]}
            }
            ).toArray()
        })
    })
}

// dbapi.getGroupAsOwnerOrAdmin = function(email, id) {
export const getGroupAsOwnerOrAdmin = function(email, id) {
    return trace('getGroupAsOwnerOrAdmin', {email, id}, () => {
        return getGroup(id).then(function(group) {
            if (group) {
                if (email === group.owner.email) {
                    return group
                }
                return loadUser(email).then(function(user) {
                    if (user && user.privilege === apiutil.ADMIN) {
                        return group
                    }
                    return false
                })
            }
            return false
        })
    })
}

// dbapi.getOwnerGroups = function(email) {
export const getOwnerGroups = function(email) {
    return trace('getOwnerGroups', {email}, () => {
        return getRootGroup().then(function(group) {
            if (email === group.owner.email) {
                return getGroups()
            }
            return getGroupsByIndex(email, 'owner')
        })
    })
}

// dbapi.createGroup = function(data) {
export const createGroup = function(data) {
    return trace('createGroup', {data}, () => {
        const id = util.format('%s', uuidv4()).replace(/-/g, '')
        return db.connect().then(client => {
            let object = Object.assign(data, {
                id: id
                , users: _.union(data.users, [data.owner.email])
                , devices: []
                , createdAt: getNow()
                , lock: {
                    user: false
                    , admin: false
                }
                , ticket: null
                , runUrl: data.runUrl
            })
            return client.collection('groups').insertOne(object)
                .then(() => {
                    return getGroup(id)
                })
        })
    })
}

// dbapi.createUserGroup = function(data) {
export const createUserGroup = function(data) {
    return trace('createUserGroup', {data}, () => {
        return reserveUserGroupInstance(data.owner.email).then(function(stats) {
            if (stats.modifiedCount > 0) {
                return getRootGroup().then(function(rootGroup) {
                    data.users = [rootGroup.owner.email]
                    return createGroup(data).then(function(group) {
                        return Promise.all([
                            addGroupUser(group.id, group.owner.email)
                            , addGroupUser(group.id, rootGroup.owner.email)
                        ])
                            .then(function() {
                                return getGroup(group.id)
                            })
                    })
                })
            }
            else {
                log.info(`Could not reserve group for user ${data.owner.email}`)
                return false
            }
        })
    })
}

// dbapi.updateGroup = function(id, data) {
export const updateGroup = function(id, data) {
    return trace('updateGroup', {id, data}, () => {
        return db.connect().then(client => {
            return client.collection('groups').updateOne(
                {id: id}
                , {
                    $set: data
                }
            ).then(() => {
                return client.collection('groups').findOne({id: id})
            })
        })
    })
}

// dbapi.reserveUserGroupInstance = function(email) {
export const reserveUserGroupInstance = function(email) {
    return trace('reserveUserGroupInstance', {email}, () => {
        return db.connect().then(async client => {
            const result = await client.collection('users').updateMany(
                {
                    email
                }
                , [{
                    $set: {'groups.quotas.consumed.number': {
                        $min: [{
                            $sum: ['$groups.quotas.consumed.number', 1]
                        }, '$groups.quotas.allocated.number']}
                    }
                }]
            )
            return result
        })
    })
}

// dbapi.releaseUserGroupInstance = function(email) {
export const releaseUserGroupInstance = function(email) {
    return trace('releaseUserGroupInstance', {email}, () => {
        return db.connect().then(async client => {
            const result = await client.collection('users').updateMany(
                {
                    email
                }
                , [{
                    $set: {'groups.quotas.consumed.number': {
                        $max: [{
                            $sum: ['$groups.quotas.consumed.number', -1]
                        }, 0]}
                    }
                }]
            )
            return result
        })
    })
}

// dbapi.updateUserGroupDuration = function(email, oldDuration, newDuration) {
export const updateUserGroupDuration = function(email, oldDuration, newDuration) {
    return trace('updateUserGroupDuration', {email, oldDuration, newDuration}, () => {
        return db.connect().then(client => {
            return client.collection('users').updateOne(
                {email: email}
                , [{
                    $set: {
                        'groups.quotas.consumed.duration': {
                            $cond: [
                                {$lte: [{$sum: ['$groups.quotas.consumed.duration', newDuration, -oldDuration]}, '$groups.quotas.allocated.duration']}
                                , {$sum: ['$groups.quotas.consumed.duration', newDuration, -oldDuration]}
                                , '$groups.quotas.consumed.duration'
                            ]
                        }
                    }
                }]
            )
        })
    })
}

// dbapi.updateUserGroupsQuotas = function(email, duration, number, repetitions) {
export const updateUserGroupsQuotas = function(email, duration, number, repetitions) {
    return trace('updateUserGroupsQuotas', {email, duration, number, repetitions}, () => {
        return db.connect().then(client => {
            return client.collection('users').findOne({email: email}).then(oldDoc => {
                let consumed = oldDoc.groups.quotas.consumed.duration
                let allocated = oldDoc.groups.quotas.allocated.duration
                let consumedNumber = oldDoc.groups.quotas.consumed.number
                let allocatedNumber = oldDoc.groups.quotas.allocated.number
                return client.collection('users').updateOne(
                    {email: email}
                    , {
                        $set: {
                            'groups.quotas.allocated.duration': duration && consumed <= duration &&
                (!number || consumedNumber <= number) ? duration : allocated
                            , 'groups.quotas.allocated.number': number && consumedNumber <= number &&
                (!duration || consumed <= duration) ? number : allocatedNumber
                            , 'groups.quotas.repetitions': repetitions || oldDoc.groups.quotas.repetitions
                        }
                    }
                )
                    .then(updateStats => {
                        return client.collection('users').findOne({email: email}).then(newDoc => {
                            updateStats.changes = [
                                {new_val: {...newDoc}, old_val: {...oldDoc}}
                            ]
                            return updateStats
                        })
                    })
            })
        })
    })
}

// dbapi.updateDefaultUserGroupsQuotas = function(email, duration, number, repetitions) {
export const updateDefaultUserGroupsQuotas = function(email, duration, number, repetitions) {
    return trace('updateDefaultUserGroupsQuotas', {email, duration, number, repetitions}, () => {
        return db.connect().then(client => {
            return client.collection('users').updateOne(
                {email: email}
                , [{
                    $set: {
                        defaultGroupsDuration: {
                            $cond: [
                                {
                                    $ne: [duration, null]
                                }
                                , duration
                                , '$groups.quotas.defaultGroupsDuration'
                            ]
                        }
                        , defaultGroupsNumber: {
                            $cond: [
                                {
                                    $ne: [number, null]
                                }
                                , number
                                , '$groups.quotas.defaultGroupsNumber'
                            ]
                        }
                        , defaultGroupsRepetitions: {
                            $cond: [
                                {
                                    $ne: [repetitions, null]
                                }
                                , repetitions
                                , '$groups.quotas.defaultGroupsRepetitions'
                            ]
                        }
                    }
                }]
            )
        })
    })
}

// dbapi.updateDeviceGroupName = function(serial, group) {
export const updateDeviceGroupName = function(serial, group) {
    return trace('updateDeviceGroupName', {serial, group}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial}
                , [{
                    $set: {
                        'group.name': {
                            $cond: [
                                {
                                    $eq: [apiutil.isOriginGroup(group.class), false]
                                }
                                , {
                                    $cond: [
                                        {
                                            $eq: [group.isActive, true]
                                        }
                                        , group.name
                                        , '$group.name'
                                    ]
                                }
                                , {
                                    $cond: [
                                        {
                                            $eq: ['$group.origin', '$group.id']
                                        }
                                        , group.name
                                        , '$group.name'
                                    ]
                                }
                            ]
                        }
                        , 'group.originName': {
                            $cond: [
                                {
                                    $eq: [apiutil.isOriginGroup(group.class), true]
                                }
                                , group.name
                                , '$group.originName'
                            ]
                        }
                    }
                }]
            )
        })
    })
}

// dbapi.updateDeviceCurrentGroupFromOrigin = function(serial) {
export const updateDeviceCurrentGroupFromOrigin = function(serial) {
    return trace('updateDeviceCurrentGroupFromOrigin', {serial}, () => {
        return db.connect().then(client => {
            return client.collection('devices').findOne({serial: serial}).then(device => {
                return client.collection('groups').findOne({id: device.group.origin}).then(group => {
                    return client.collection('devices').updateOne(
                        {serial: serial}
                        , {
                            $set: {
                                'group.id': device.group.origin
                                , 'group.name': device.group.originName
                                , 'group.owner': group.owner
                                , 'group.lifeTime': group.dates[0]
                                , 'group.class': group.class
                                , 'group.repetitions': group.repetitions
                                , 'group.runUrl': group.runUrl
                            }
                        }
                    )
                })
            })
        })
    })
}

// dbapi.askUpdateDeviceOriginGroup = function(serial, group, signature) {
export const askUpdateDeviceOriginGroup = function(serial, group, signature) {
    return trace('askUpdateDeviceOriginGroup', {serial, group, signature}, () => {
        return db.connect().then(client => {
            return client.collection('groups').updateOne(
                {
                    id: group.id
                }
                , {
                    $set: {
                        ticket: {
                            serial: serial
                            , signature: signature
                        }
                    }
                }
            )
        })
    })
}

// dbapi.updateDeviceOriginGroup = function(serial, group) {
export const updateDeviceOriginGroup = function(serial, group) {
    return trace('updateDeviceOriginGroup', {serial, group}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial}
                , [{
                    $set: {
                        'group.origin': group.id
                        , 'group.originName': group.name
                        , 'group.id': {
                            $cond: [
                                {
                                    $eq: ['$group.id', '$group.origin']
                                }
                                , group.id
                                , '$group.id'
                            ]
                        }
                        , 'group.name': {
                            $cond: [
                                {
                                    $eq: ['$group.id', '$group.origin']
                                }
                                , group.name
                                , '$group.name'
                            ]
                        }
                        , 'group.owner': {
                            $cond: [
                                {
                                    $eq: ['$group.id', '$group.origin']
                                }
                                , group.owner
                                , '$group.owner'
                            ]
                        }
                        , 'group.lifeTime': {
                            $cond: [
                                {
                                    $eq: ['$group.id', '$group.origin']
                                }
                                , group.dates[0]
                                , '$group.lifeTime'
                            ]
                        }
                        , 'group.class': {
                            $cond: [
                                {
                                    $eq: ['$group.id', '$group.origin']
                                }
                                , group.class
                                , '$group.class'
                            ]
                        }
                        , 'group.repetitions': {
                            $cond: [
                                {
                                    $eq: ['$group.id', '$group.origin']
                                }
                                , group.repetitions
                                , '$group.repetitions'
                            ]
                        }
                    }
                }]
            )
        })
            .then(function() {
                return db.connect().then(clients => {
                    return clients.collection('devices').findOne({serial: serial})
                })
            })
    })
}

// dbapi.updateDeviceCurrentGroup = function(serial, group) {
export const updateDeviceCurrentGroup = function(serial, group) {
    return trace('updateDeviceCurrentGroup', {serial, group}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {
                        'group.id': group.id
                        , 'group.name': group.name
                        , 'group.owner': group.owner
                        , 'group.lifeTime': group.dates[0]
                        , 'group.class': group.class
                        , 'group.repetitions': group.repetitions
                    }
                }
            )
        })
    })
}

// dbapi.updateDevicesCurrentGroup = function(serials, group) {
export const updateDevicesCurrentGroup = function(serials, group) {
    return trace('updateDevicesCurrentGroup', {serials, group}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateMany(
                {serial: {$in: serials}},
                {
                    $set: {
                        'group.id': group.id
                        , 'group.name': group.name
                        , 'group.owner': group.owner
                        , 'group.lifeTime': group.dates[0]
                        , 'group.class': group.class
                        , 'group.repetitions': group.repetitions
                        , 'group.runUrl': group.runUrl
                    }
                }
            )
        })
    })
}

// dbapi.returnDeviceToOriginGroup = function(serial) {
export const returnDeviceToOriginGroup = function(serial) {
    return trace('returnDeviceToOriginGroup', {serial}, () => {
        return loadDeviceBySerial(serial)
            .then((device) => {
                return getRootGroup()
                    .then((group) => {
                        return db.connect().then(client => {
                            return client.collection('devices').updateOne(
                                {serial: device.serial},
                                {
                                    $set: {
                                        'group.id': group.id
                                        , 'group.name': group.name
                                        , 'group.owner': group.owner
                                        , 'group.lifeTime': group.dates[0]
                                        , 'group.class': group.class
                                        , 'group.repetitions': group.repetitions
                                    }
                                }
                            )
                        })
                    })
            })
    })
}

// dbapi.returnDevicesToOriginGroup = function(serials) {
export const returnDevicesToOriginGroup = function(serials) {
    return trace('returnDevicesToOriginGroup', {serials}, () => {
        return getRootGroup()
            .then(group => {
                return db.connect().then(client => {
                    return client.collection('devices').updateMany(
                        {serial: {$in: serials}}
                        , {
                            $set: {
                                'group.id': group.id
                                , 'group.name': group.name
                                , 'group.owner': group.owner
                                , 'group.lifeTime': group.dates[0]
                                , 'group.class': group.class
                                , 'group.repetitions': group.repetitions
                            }
                        }
                    )
                })
            })
    })
}

// dbapi.updateUserGroup = function(group, data) {
export const updateUserGroup = function(group, data) {
    return trace('updateUserGroup', {group, data}, () => {
        return updateUserGroupDuration(group.owner.email, group.duration, data.duration)
            .then(function(stats) {
                if (stats.modifiedCount > 0 || stats.matchedCount > 0 && group.duration === data.duration) {
                    return updateGroup(group.id, data)
                }
                return false
            })
    })
}

// dbapi.deleteGroup = function(id) {
export const deleteGroup = function(id) {
    return trace('deleteGroup', {id}, () => {
        return db.connect().then(client => {
            return client.collection('groups').deleteOne({id: id})
        })
    })
}

// dbapi.deleteUserGroup = function(id) {
export const deleteUserGroup = function(id) {
    return trace('deleteUserGroup', {id}, () => {
        function deleteUserGroup(group) {
            return deleteGroup(group.id)
                .then(() => {
                    return Promise.map(group.users, function(email) {
                        return removeGroupUser(group.id, email)
                    })
                })
                .then(() => {
                    return releaseUserGroupInstance(group.owner.email)
                })
                .then(() => {
                    return updateUserGroupDuration(group.owner.email, group.duration, 0)
                })
                .then(() => {
                    return returnDevicesToOriginGroup(group.devices)
                })
                .then(function() {
                    return 'deleted'
                })
        }

        return getGroup(id).then(function(group) {
            if (group.privilege !== apiutil.ROOT) {
                return deleteUserGroup(group)
            }
            return 'forbidden'
        })
    })
}

// dbapi.createUser = function(email, name, ip) {
export const createUser = function(email, name, ip) {
    return trace('createUser', {email, name, ip}, () => {
        return getRootGroup().then(function(group) {
            return loadUser(group.owner.email).then(function(adminUser) {
                let userObj = {
                    email: email
                    , name: name
                    , ip: ip
                    , group: wireutil.makePrivateChannel()
                    , lastLoggedInAt: getNow()
                    , createdAt: getNow()
                    , forwards: []
                    , settings: {}
                    , acceptedPolicy: false
                    , privilege: adminUser ? apiutil.USER : apiutil.ADMIN
                    , groups: {
                        subscribed: []
                        , lock: false
                        , quotas: {
                            allocated: {
                                number: group.envUserGroupsNumber
                                , duration: group.envUserGroupsDuration
                            }
                            , consumed: {
                                number: 0
                                , duration: 0
                            }
                            , defaultGroupsNumber: group.envUserGroupsNumber
                            , defaultGroupsDuration: group.envUserGroupsDuration
                            , defaultGroupsRepetitions: group.envUserGroupsRepetitions
                            , repetitions: group.envUserGroupsRepetitions
                        }
                    }
                }
                return db.connect().then(client => {
                    return client.collection('users').insertOne(userObj)
                })
                    .then(function(stats) {
                        if (stats.insertedId) {
                            return addGroupUser(group.id, email).then(function() {
                                return loadUser(email).then(function(user) {
                                    stats.changes = [
                                        {new_val: {...user}}
                                    ]
                                    return stats
                                })
                            })
                        }
                        return stats
                    })
            })
        })
    })
}

// dbapi.saveUserAfterLogin = function(user) {
export const saveUserAfterLogin = function(user) {
    return trace('saveUserAfterLogin', {user}, () => {
        return db.connect().then(client => {
            return client.collection('users').updateOne({email: user.email},
                {
                    $set: {
                        name: user.name
                        , ip: user.ip
                        , lastLoggedInAt: getNow()
                    }
                })
                .then(function(stats) {
                    if (stats.modifiedCount === 0) {
                        return createUser(user.email, user.name, user.ip)
                    }
                    return stats
                })
        })
    })
}

// dbapi.loadUser = function(email) {
export const loadUser = function(email) {
    return trace('loadUser', {email}, () => {
        return db.connect().then(client => {
            return client.collection('users').findOne({email: email})
        })
    })
}

// dbapi.updateUsersAlertMessage = function(alertMessage) {
export const updateUsersAlertMessage = function(alertMessage) {
    return trace('updateUsersAlertMessage', {alertMessage}, () => {
        return db.connect().then(client => {
            return client.collection('users').updateOne(
                {
                    email: apiutil.STF_ADMIN_EMAIL
                }
                , {
                    $set: Object.fromEntries(Object.entries(alertMessage).map(([key, value]) =>
                        ['settings.alertMessage.' + key, value]
                    )),
                }
            ).then(updateStats => {
                return client.collection('users').findOne({email: apiutil.STF_ADMIN_EMAIL}).then(updatedMainAdmin => {
                    updateStats.changes = [
                        {new_val: {...updatedMainAdmin}}
                    ]
                    return updateStats
                })
            })
        })
    })
}

// dbapi.updateUserSettings = function(email, changes) {
export const updateUserSettings = function(email, changes) {
    return trace('updateUserSettings', {email, changes}, () => {
        return db.connect().then(client => {
            return client.collection('users').findOne({email: email}).then(user => {
                return client.collection('users').updateOne(
                    {
                        email: email
                    }
                    , {
                        $set: {
                            settings: {...user.settings, ...changes}
                        }
                    }
                )
            })
        })
    })
}

// dbapi.resetUserSettings = function(email) {
export const resetUserSettings = function(email) {
    return trace('resetUserSettings', {email}, () => {
        return db.connect().then(client => {
            return client.collection('users').updateOne({email: email},
                {
                    $set: {
                        settings: {}
                    }
                })
        })
    })
}

// dbapi.insertUserAdbKey = function(email, key) {
export const insertUserAdbKey = function(email, key) {
    return trace('insertUserAdbKey', {email, key}, () => {
        let data = {
            title: key.title
            , fingerprint: key.fingerprint
        }
        return db.connect().then(client => {
            return client.collection('users').findOne({email: email}).then(user => {
                let adbKeys = user.adbKeys ? user.adbKeys : []
                adbKeys.push(data)
                return client.collection('users').updateOne(
                    {email: email}
                    , {$set: {adbKeys: user.adbKeys ? adbKeys : [data]}}
                )
            })
        })
    })
}

// dbapi.deleteUserAdbKey = function(email, fingerprint) {
export const deleteUserAdbKey = function(email, fingerprint) {
    return trace('deleteUserAdbKey', {email, fingerprint}, () => {
        return db.connect().then(client => {
            return client.collection('users').findOne({email: email}).then(user => {
                return client.collection('users').updateOne(
                    {email: email}
                    , {
                        $set: {
                            adbKeys: user.adbKeys ? user.adbKeys.filter(key => {
                                return key.fingerprint !== fingerprint
                            }) : []
                        }
                    }
                )
            })
        })
    })
}

// dbapi.lookupUsersByAdbKey = function(fingerprint) {
export const lookupUsersByAdbKey = function(fingerprint) {
    return trace('lookupUsersByAdbKey', {fingerprint}, () => {
        return db.connect().then(client => {
            return client.collection('users').find({
                adbKeys: fingerprint
            }).toArray()
        })
    })
}

// dbapi.lookupUserByAdbFingerprint = function(fingerprint) {
export const lookupUserByAdbFingerprint = function(fingerprint) {
    return trace('lookupUserByAdbFingerprint', {fingerprint}, () => {
        return db.connect().then(client => {
            return client.collection('users').find(
                {adbKeys: {$elemMatch: {fingerprint: fingerprint}}}
                , {email: 1, name: 1, group: 1, _id: 0}
            ).toArray()
                .then(function(users) {
                    switch (users.length) {
                    case 1:
                        return users[0]
                    case 0:
                        return null
                    default:
                        throw new Error('Found multiple users for same ADB fingerprint')
                    }
                })
        })
    })
}

// dbapi.lookupUserByVncAuthResponse = function(response, serial) {
export const lookupUserByVncAuthResponse = function(response, serial) {
    return trace('lookupUserByVncAuthResponse', {response, serial}, () => {
        return db.connect().then(client => {
            return client.collection('vncauth').aggregate([
                {
                    $match: {
                        'responsePerDevice.response': response
                        , 'responsePerDevice.serial': serial
                    }
                }
                , {
                    $lookup: {
                        from: 'users'
                        , localField: 'userId'
                        , foreignField: '_id'
                        , as: 'users'
                    }
                }
                , {
                    $project: {
                        email: 1
                        , name: 1
                        , group: 1
                    }
                }
            ]).toArray()
        })
            .then(function(groups) {
                switch (groups.length) {
                case 1:
                    return groups[0]
                case 0:
                    return null
                default:
                    throw new Error('Found multiple users with the same VNC response')
                }
            })
    })
}

// dbapi.loadUserDevices = function(email) {
export const loadUserDevices = function(email) {
    return trace('loadUserDevices', {email}, () => {
        return db.connect().then(client => {
            return client.collection('users').findOne({email: email}).then(user => {
                let userGroups = user.groups.subscribed
                return client.collection('devices').find(
                    {
                        'owner.email': email
                        , present: true
                        , 'group.id': {$in: userGroups}
                    }
                ).toArray()
            })
        })
    })
}

// dbapi.saveDeviceLog = function(serial, entry) {
export const saveDeviceLog = function(serial, entry) {
    return trace('saveDeviceLog', {serial, entry}, () => {
        return db.connect().then(client => {
            return client.collection('logs').insertOne({
                id: uuidv4()
                , serial: serial
                , timestamp: new Date(entry.timestamp)
                , priority: entry.priority
                , tag: entry.tag
                , pid: entry.pid
                , message: entry.message
            }
            )
        })
    })
}

// dbapi.saveDeviceInitialState = function(serial, device) {
export const saveDeviceInitialState = function(serial, device) {
    return trace('saveDeviceInitialState', {serial, device}, () => {
        let data = {
            present: true
            , presenceChangedAt: getNow()
            , provider: device.provider
            , owner: null
            , status: 1
            , statusChangedAt: getNow()
            , bookedBefore: 0
            , ready: true
            , reverseForwards: []
            , remoteConnect: false
            , remoteConnectUrl: null
            , usage: null
            , logs_enabled: false
            , ...device
        }
        return db.connect().then(client => {
            return client.collection('devices').updateOne({serial: serial},
                {
                    $set: data
                }
            )
                .then(stats => {
                    if (stats.modifiedCount === 0 && stats.matchedCount === 0) {
                        return getRootGroup().then(function(group) {
                            data.serial = serial
                            data.createdAt = getNow()
                            data.group = {
                                id: group.id
                                , name: group.name
                                , lifeTime: group.dates[0]
                                , owner: group.owner
                                , origin: group.id
                                , class: group.class
                                , repetitions: group.repetitions
                                , originName: group.name
                                , lock: false
                            }
                            return client.collection('devices').insertOne(data)
                                .then(() => {
                                    return addOriginGroupDevice(group, serial)
                                })
                        })
                    }
                    return true
                })
                .then(() => {
                    return client.collection('devices').findOne({serial: serial})
                })
        })
    })
}

// dbapi.setDeviceConnectUrl = function(serial, url) {
export const setDeviceConnectUrl = function(serial, url) {
    return trace('setDeviceConnectUrl', {serial, url}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {
                        remoteConnectUrl: url
                        , remoteConnect: true
                    }
                }
            )
        })
    })
}

// dbapi.unsetDeviceConnectUrl = function(serial) {
export const unsetDeviceConnectUrl = function(serial) {
    return trace('unsetDeviceConnectUrl', {serial}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {
                        remoteConnectUrl: null
                        , remoteConnect: false
                    }
                }
            )
        })
    })
}

// dbapi.saveDeviceStatus = function(serial, status) {
export const saveDeviceStatus = function(serial, status) {
    return trace('saveDeviceStatus', {serial, status}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {
                        status: status
                        , statusChangedAt: getNow()
                    }
                }
            )
        })
    })
}

// dbapi.enhanceStatusChangedAt = function(serial, timeout) {
export const enhanceStatusChangedAt = function(serial, timeout) {
    return trace('enhanceStatusChangedAt', {serial, timeout}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {
                        statusChangedAt: getNow()
                        , bookedBefore: timeout
                    }
                }
            )
        })
    })
}

// dbapi.setDeviceOwner = function(serial, owner) {
export const setDeviceOwner = function(serial, owner) {
    return trace('setDeviceOwner', {serial, owner}, () => {
        log.info('Setting device owner in db - ' + owner.email)
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {owner: owner}
                }
            )
        })
    })
}

// dbapi.setDevicePlace = function(serial, place) {
export const setDevicePlace = function(serial, place) {
    return trace('setDevicePlace', {serial, place}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {place: place}
                }
            )
        })
    })
}

// dbapi.setDeviceStorageId = function(serial, storageId) {
export const setDeviceStorageId = function(serial, storageId) {
    return trace('setDeviceStorageId', {serial, storageId}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {storageId: storageId}
                }
            )
        })
    })
}


// dbapi.unsetDeviceOwner = function(serial) {
export const unsetDeviceOwner = function(serial) {
    return trace('unsetDeviceOwner', {serial}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {owner: null}
                }
            )
        })
    })
}

// dbapi.setDevicePresent = function(serial) {
export const setDevicePresent = function(serial) {
    return trace('setDevicePresent', {serial}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {
                        present: true
                        , presenceChangedAt: getNow()
                    }
                }
            )
        })
    })
}

// dbapi.setDeviceAbsent = function(serial) {
export const setDeviceAbsent = function(serial) {
    return trace('setDeviceAbsent', {serial}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {
                        owner: null
                        , present: false
                        , presenceChangedAt: getNow()
                    }
                }
            )
        })
    })
}

// dbapi.setDeviceUsage = function(serial, usage) {
export const setDeviceUsage = function(serial, usage) {
    return trace('setDeviceUsage', {serial, usage}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {
                        usage: usage
                        , usageChangedAt: getNow()
                    }
                }
            )
        })
    })
}

// dbapi.unsetDeviceUsage = function(serial) {
export const unsetDeviceUsage = function(serial) {
    return trace('unsetDeviceUsage', {serial}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {
                        usage: null
                        , usageChangedAt: getNow()
                        , logs_enabled: false
                    }
                }
            )
        })
    })
}

// dbapi.setDeviceAirplaneMode = function(serial, enabled) {
export const setDeviceAirplaneMode = function(serial, enabled) {
    return trace('setDeviceAirplaneMode', {serial, enabled}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {
                        airplaneMode: enabled
                    }
                }
            )
        })
    })
}

// dbapi.setDeviceBattery = function(serial, battery) {
export const setDeviceBattery = function(serial, battery) {
    return trace('setDeviceBattery', {serial, battery}, () => {
        const batteryData = {
            status: battery.status
            , health: battery.health
            , source: battery.source
            , level: battery.level
            , scale: battery.scale
            , temp: battery.temp
            , voltage: battery.voltage
        }
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {battery: batteryData}
                }
            )
        })
    })
}

// dbapi.setDeviceBrowser = function(serial, browser) {
export const setDeviceBrowser = function(serial, browser) {
    return trace('setDeviceBrowser', {serial, browser}, () => {
        const browserData = {
            selected: browser.selected
            , apps: browser.apps
        }

        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {browser: browserData}
                }
            )
        })
    })
}

// dbapi.setDeviceServicesAvailability = function(serial, service) {
export const setDeviceServicesAvailability = function(serial, service) {
    return trace('setDeviceServicesAvailability', {serial, service}, () => {
        const serviceData = {
            hasHMS: service.hasHMS
            , hasGMS: service.hasGMS
        }
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {service: serviceData}
                }
            )
        })
    })
}

// dbapi.setDeviceConnectivity = function(serial, connectivity) {
export const setDeviceConnectivity = function(serial, connectivity) {
    return trace('setDeviceConnectivity', {serial, connectivity}, () => {
        const networkData = {
            connected: connectivity.connected
            , type: connectivity.type
            , subtype: connectivity.subtype
            , failover: !!connectivity.failover
            , roaming: !!connectivity.roaming
        }
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {network: networkData}
                }
            )
        })
    })
}

// dbapi.setDevicePhoneState = function(serial, state) {
export const setDevicePhoneState = function(serial, state) {
    return trace('setDevicePhoneState', {serial, state}, () => {
        const networkData = {
            state: state.state
            , manual: state.manual
            , operator: state.operator
        }
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {network: networkData}
                }
            )
        })
    })
}

// dbapi.setDeviceRotation = function(serial, rotation) {
export const setDeviceRotation = function(message) {
    return trace('setDeviceRotation', {message}, () => {
        return db.connect().then(client => {
            let setObj = {
                'display.rotation': message.rotation
            }
            if (message.height !== null) {
                setObj['display.height'] = message.height
                setObj['display.width'] = message.width
            }
            return client.collection('devices').updateOne(
                {serial: message.serial},
                {
                    $set: setObj
                }
            )
        })
    })
}

// dbapi.setDeviceNote = function(serial, note) {
export const setDeviceNote = function(serial, note) {
    return trace('setDeviceNote', {serial, note}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {notes: note}
                }
            )
        })
    })
}

// dbapi.setDeviceReverseForwards = function(serial, forwards) {
export const setDeviceReverseForwards = function(serial, forwards) {
    return trace('setDeviceReverseForwards', {serial, forwards}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {reverseForwards: forwards}
                }
            )
        })
    })
}

// dbapi.setDeviceReady = function(serial, channel) {
export const setDeviceReady = function(serial, channel) {
    return trace('setDeviceReady', {serial, channel}, () => {
        const data = {
            channel: channel
            , ready: true
            , owner: null
            , present: true
            , reverseForwards: []
        }
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: data
                }
            )
        })
    })
}

// dbapi.saveDeviceIdentity = function(serial, identity) {
export const saveDeviceIdentity = function(serial, identity) {
    return trace('saveDeviceIdentity', {serial, identity}, () => {
        const identityData = {
            platform: identity.platform
            , manufacturer: identity.manufacturer
            , operator: identity.operator
            , model: identity.model
            , version: identity.version
            , abi: identity.abi
            , sdk: identity.sdk
            , display: identity.display
            , phone: identity.phone
            , product: identity.product
            , cpuPlatform: identity.cpuPlatform
            , openGLESVersion: identity.openGLESVersion
            , marketName: identity.marketName
            , macAddress: identity.macAddress
            , ram: identity.ram
        }

        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: identityData
                }
            )
        })
    })
}

// dbapi.loadDevices = function(groups) {
export const loadDevices = function(groups) {
    return trace('loadDevices', {groups}, () => {
        return db.connect().then(client => {
            if (groups.length > 0) {
                return client.collection('devices').find(
                    {
                        'group.id': {$in: groups}
                    }
                ).toArray()
            }
            else {
                return client.collection('devices').find().toArray()
            }
        })
    })
}

// dbapi.loadDevicesByOrigin = function(groups) {
export const loadDevicesByOrigin = function(groups) {
    return trace('loadDevicesByOrigin', {groups}, () => {
        return db.connect().then(client => {
            return client.collection('devices').find(
                {'group.origin': {$in: groups}}
            ).toArray()
        })
    })
}

// dbapi.loadBookableDevices = function(groups) {
export const loadBookableDevices = function(groups) {
    return trace('loadBookableDevices', {groups}, () => {
        return db.connect().then(client => {
            return client.collection('devices').find(
                {
                    $and: [
                        {'group.origin': {$in: groups}}
                        , {present: {$eq: true}}
                        , {ready: {$eq: true}}
                        , {owner: {$eq: null}}
                    ]
                }
            ).toArray()
        })
    })
}

export const loadBookableDevicesWithFiltersLock = function(groups, abi, model, type, sdk, version, devicesFunc, limit = null) {
    return trace('loadBookableDevicesWithFiltersLock', {groups, abi, model, type, sdk, version, devicesFunc, limit}, () => {
        let filterOptions = []
        let serials = []
        if (abi) {
            filterOptions.push({abi: {$eq: abi}})
        }
        if (model) {
            filterOptions.push({model: {$eq: model}})
        }
        if (sdk) {
            filterOptions.push({sdk: {$eq: sdk}})
        }
        if (version) {
            filterOptions.push({version: {$eq: version}})
        }
        if (type) {
            filterOptions.push({deviceType: {$eq: type}})
        }
        return db.connect().then(client => {
            let result = client.collection('devices').find(
                {
                    $and: [
                        {'group.origin': {$in: groups}}
                        , {'group.class': {$eq: apiutil.BOOKABLE}}
                        , {present: {$eq: true}}
                        , {ready: {$eq: true}}
                        , {owner: {$eq: null}}
                        , {'group.lock': {$eq: false}}
                        , ...filterOptions
                    ]
                }
            )
            if (limit) {
                result = result.limit(limit)
            }
            return result.toArray()
                .then(devices => {
                    serials = devices.map(device => device.serial)
                    lockDevices(serials).then(() => {
                        return devicesFunc(devices)
                    })
                        .finally(() => {
                            if (serials.length > 0) {
                                unlockDevices(serials)
                            }
                        })
                })
        })
    })
}

// dbapi.loadStandardDevices = function(groups) {
export const loadStandardDevices = function(groups) {
    return trace('loadStandardDevices', {groups}, () => {
        return db.connect().then(client => {
            return client.collection('devices')
                .find({
                    'group.class': apiutil.STANDARD
                    , 'group.id': {$in: groups}
                })
                .toArray()
        })
    })
}

// dbapi.loadPresentDevices = function() {
export const loadPresentDevices = function() {
    return trace('loadPresentDevices', {}, () => {
        return db.connect().then(client => {
            return client.collection('devices').find({present: true})
        })
    })
}

// dbapi.loadDeviceBySerial = function(serial) {
export const loadDeviceBySerial = function(serial) {
    return trace('loadDeviceBySerial', {serial}, () => {
        return db.connect().then(client => {
            return client.collection('devices').findOne({serial: serial})
        })
    })
}

// dbapi.loadDevicesBySerials = function(serials) {
export const loadDevicesBySerials = function(serials) {
    return trace('loadDevicesBySerials', {serials}, () => {
        return db.connect().then(client => {
            return client.collection('devices').find({serial: {$in: serials}}).toArray()
        })
    })
}

// dbapi.loadDevice = function(groups, serial) {
export const loadDevice = function(groups, serial) {
    return trace('loadDevice', {groups, serial}, () => {
        return db.connect().then(client => {
            return client.collection('devices').findOne(
                {
                    serial: serial
                    , 'group.id': {$in: groups}
                }
            )
        })
    })
}

// dbapi.loadBookableDevice = function(groups, serial) {
export const loadBookableDevice = function(groups, serial) {
    return trace('loadBookableDevice', {groups, serial}, () => {
        return db.connect().then(client => {
            return client.collection('devices')
                .find(
                    {
                        serial: serial
                        , 'group.origin': {$in: groups}
                        , 'group.class': {$ne: apiutil.STANDARD}
                    }
                )
                .toArray()
        })
    })
}

// dbapi.loadDeviceByCurrent = function(groups, serial) {
export const loadDeviceByCurrent = function(groups, serial) {
    return trace('loadDeviceByCurrent', {groups, serial}, () => {
        return db.connect().then(client => {
            return client.collection('devices')
                .find(
                    {
                        serial: serial
                        , 'group.id': {$in: groups}
                    }
                )
                .toArray()
        })
    })
}

// dbapi.loadDeviceByOrigin = function(groups, serial) {
export const loadDeviceByOrigin = function(groups, serial) {
    return trace('loadDeviceByOrigin', {groups, serial}, () => {
        return db.connect().then(client => {
            return client.collection('devices')
                .find(
                    {
                        serial: serial
                        , 'group.origin': {$in: groups}
                    }
                )
                .toArray()
        })
    })
}

// dbapi.saveUserAccessToken = function(email, token) {
export const saveUserAccessToken = function(email, token) {
    return trace('saveUserAccessToken', {email, token}, () => {
        return db.connect().then(client => {
            return client.collection('accessTokens').insertOne(
                {
                    email: email
                    , id: token.id
                    , title: token.title
                    , jwt: token.jwt
                }
            )
        })
    })
}

// dbapi.removeUserAccessTokens = function(email) {
export const removeUserAccessTokens = function(email) {
    return trace('removeUserAccessTokens', {email}, () => {
        return db.connect().then(client => {
            return client.collection('accessTokens').deleteMany(
                {
                    email: email
                }
            )
        })
    })
}

// dbapi.removeUserAccessToken = function(email, title) {
export const removeUserAccessToken = function(email, title) {
    return trace('removeUserAccessToken', {email, title}, () => {
        return db.connect().then(client => {
            return client.collection('accessTokens').deleteOne(
                {
                    email: email
                    , title: title
                }
            )
        })
    })
}

// dbapi.removeAccessToken = function(id) {
export const removeAccessToken = function(id) {
    return trace('removeAccessToken', {id}, () => {
        return db.connect().then(client => {
            return client.collection('accessTokens').deleteOne({id: id})
        })
    })
}

// dbapi.loadAccessTokens = function(email) {
export const loadAccessTokens = function(email) {
    return trace('loadAccessTokens', {email}, () => {
        return db.connect().then(client => {
            return client.collection('accessTokens').find({email: email}).toArray()
        })
    })
}

// dbapi.loadAccessToken = function(id) {
export const loadAccessToken = function(id) {
    return trace('loadAccessToken', {id}, () => {
        return db.connect().then(client => {
            return client.collection('accessTokens').findOne({id: id})
        })
    })
}

// dbapi.grantAdmin = function(email) {
export const grantAdmin = function(email) {
    return trace('grantAdmin', {email}, () => {
        return db.connect().then(client => {
            return client.collection('users').updateOne({email: email},
                {
                    $set: {
                        privilege: apiutil.ADMIN
                    }
                })
        })
    })
}

// dbapi.revokeAdmin = function(email) {
export const revokeAdmin = function(email) {
    return trace('revokeAdmin', {email}, () => {
        return db.connect().then(client => {
            return client.collection('users').updateOne({email: email},
                {
                    $set: {
                        privilege: apiutil.USER
                    }
                })
        })
    })
}

// dbapi.makeOriginGroupBookable = function() {
export const makeOriginGroupBookable = function() {
    return trace('makeOriginGroupBookable', {}, () => {
        return db.connect().then(client => {
            return client.collection('groups').updateOne(
                {
                    name: 'Common'
                }
                , {
                    $set: {
                        class: apiutil.BOOKABLE
                    }
                }
            )
        })
    })
}

// dbapi.acceptPolicy = function(email) {
export const acceptPolicy = function(email) {
    return trace('acceptPolicy', {email}, () => {
        return db.connect().then(client => {
            return client.collection('users').updateOne({email: email},
                {
                    $set: {
                        acceptedPolicy: true
                    }
                })
        })
    })
}

// dbapi.writeStats = function(user, serial, action) {
export const writeStats = function(user, serial, action) {
    return trace('writeStats', {user, serial, action}, () => {
        return db.connect().then(client => {
            return client.collection('stats').insertOne({
                id: (uuidv4() + '_' + user.email + '_' + user.group)
                , user: user.email
                , action: action
                , device: serial
                , timestamp: getNow()
            }
            )
        })
    })
}

// dbapi.getDevicesCount = function() {
export const getDevicesCount = function() {
    return trace('getDevicesCount', {}, () => {
        return db.connect().then(client => {
            return client.collection('devices').find().count()
        })
    })
}

// dbapi.getOfflineDevicesCount = function() {
export const getOfflineDevicesCount = function() {
    return trace('getOfflineDevicesCount', {}, () => {
        return db.connect().then(client => {
            return client.collection('devices').find(
                {
                    present: false
                }
            ).count()
        })
    })
}

// dbapi.getOfflineDevices = function() {
export const getOfflineDevices = function() {
    return trace('getOfflineDevices', {}, () => {
        return db.connect().then(client => {
            return client.collection('devices').find(
                {present: false},
                {_id: 0, 'provider.name': 1}
            ).toArray()
        })
    })
}

// dbapi.isPortExclusive = function(newPort) {
export const isPortExclusive = function(newPort) {
    return trace('isPortExclusive', {newPort}, () => {
        return getAllocatedAdbPorts().then((ports) => {
            let result = !!ports.find(port => port === newPort)
            return !result
        })
    })
}

// dbapi.getLastAdbPort = function() {
export const getLastAdbPort = function() {
    return trace('getLastAdbPort', {}, () => {
        return getAllocatedAdbPorts().then((ports) => {
            if (ports.length === 0) {
                return 0
            }
            return Math.max(...ports)
        })
    })
}

// dbapi.getAllocatedAdbPorts = function() {
export const getAllocatedAdbPorts = function() {
    return trace('getAllocatedAdbPorts', {}, () => {
        return db.connect().then(client => {
            return client.collection('devices').find({}, {adbPort: 1, _id: 0}).toArray().then(ports => {
                let result = []
                ports.forEach((port) => {
                    if (port.adbPort) {
                        let portNum
                        if (typeof port.adbPort === 'string') {
                            portNum = parseInt(port.adbPort.replace('"', '').replace('\'', ''), 10)
                        }
                        else {
                            portNum = port.adbPort
                        }
                        result.push(portNum)
                    }
                })
                return result.sort((a, b) => a - b)
            })
        })
    })
}

// dbapi.initiallySetAdbPort = function(serial) {
export const initiallySetAdbPort = function(serial) {
    return trace('initiallySetAdbPort', {serial}, () => {
        return getFreeAdbPort().then((port) => {
            if (port) {
                return setAdbPort(serial, port)
            }
            else {
                return null
            }
        })
    })
}

// dbapi.setAdbPort = function(serial, port) {
export const setAdbPort = function(serial, port) {
    return trace('setAdbPort', {serial, port}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne({serial: serial}, {$set: {adbPort: port}}).then(() => {
                return port
            })
        })
    })
}

// dbapi.getAdbRange = function() {
export const getAdbRange = function() {
    return trace('getAdbRange', {}, () => {
        return db.getRange()
    })
}

// dbapi.getFreeAdbPort = function() {
export const getFreeAdbPort = function() {
    return trace('getFreeAdbPort', {}, () => {
        const adbRange = getAdbRange().split('-')
        const adbRangeStart = parseInt(adbRange[0], 10)
        const adbRangeEnd = parseInt(adbRange[1], 10)

        return getLastAdbPort().then((lastPort) => {
            if (lastPort === 0) {
                return adbRangeStart
            }
            let freePort = lastPort + 1
            if (freePort > adbRangeEnd || freePort <= adbRangeStart) {
                log.error('Port: ' + freePort + ' out of range [' + adbRangeStart + ':' + adbRangeEnd + ']')
                return null
            }

            return isPortExclusive(freePort).then((result) => {
                if (result) {
                    return freePort
                }
                else {
                    log.error('Port: ' + freePort + ' not exclusive.')
                    return null
                }
            })
        })
    })
}

// dbapi.generateIndexes = function() {
export const generateIndexes = function() {
    return trace('generateIndexes', {}, () => {
        return db.connect().then(client => {
            client.collection('devices').createIndex({serial: -1}, function(err, result) {
                log.info('Created indexes with result - ' + result)
            })
        })
    })
}

// dbapi.setDeviceSocketDisplay = function(data) {
export const setDeviceSocketDisplay = function(data) {
    return trace('setDeviceSocketDisplay', {data}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: data.serial},
                {
                    $set: {
                        'display.density': 2
                        , 'display.fps': 60
                        , 'display.id': 0
                        , 'display.rotation': 0
                        , 'display.secure': true
                        , 'display.size': 4.971253395080566
                        , 'display.xdpi': 294.9670104980469
                        , 'display.ydpi': 295.56298828125
                        , 'display.width': data.width
                        , 'display.height': data.height
                    }
                }
            ).then(() => {
                loadDeviceBySerial(data.serial)
            })
        })
    })
}

// dbapi.setDeviceSocketPorts = function(data, publicIp) {
export const setDeviceSocketPorts = function(data, publicIp) {
    return trace('setDeviceSocketPorts', {data, publicIp}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: data.serial},
                {
                    $set: {
                        'display.url': `ws://${publicIp}:${data.screenPort}/`
                        , 'display.screenPort': data.screenPort
                        , 'display.connectPort': data.connectPort
                    }
                }
            ).then(() => {
                loadDeviceBySerial(data.serial)
            })
        })
    })
}

// dbapi.updateIosDevice = function(message) {
export const updateIosDevice = function(message) {
    return trace('updateIosDevice', {message}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {
                    serial: message.id
                },
                {
                    $set: {
                        id: message.id
                        , model: message.name
                        , platform: message.platform
                        , sdk: message.architect
                    }
                }
            )
        })
    })
}

// dbapi.setDeviceIosVersion = function(message) {
export const setDeviceIosVersion = function(message) {
    return trace('setDeviceIosVersion', {message}, () => {
        const data = {
            version: message.sdkVersion
        }

        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: message.id},
                {
                    $set: data
                }
            )
        })
    })
}

// dbapi.sizeIosDevice = function(serial, height, width, scale) {
export const sizeIosDevice = function(serial, height, width, scale) {
    return trace('sizeIosDevice', {serial, height, width, scale}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: serial},
                {
                    $set: {
                        'display.scale': scale
                        , 'display.height': height
                        , 'display.width': width
                    }
                }
            )
        })
    })
}

// dbapi.getDeviceDisplaySize = function(serial) {
export const getDeviceDisplaySize = function(serial) {
    return trace('getDeviceDisplaySize', {serial}, () => {
        return db.connect().then(client => {
            return client.collection('devices').findOne({serial: serial})
                .then(result => {
                    return result.display
                })
        })
    })
}

export const setAbsentDisconnectedDevices = function() {
    return trace('setAbsentDisconnectedDevices', {}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {
                    ios: true
                },
                {
                    $set: {
                        present: false
                        , ready: false
                    }
                }
            )
        })
    })
}

/* // @TODO refactor setDeviceApp
/!**
 *
 * @param message obj with application options
 * @method check if exists app with equal option
 * if exists replace it or append to installedApps list
 *
 *!/
// dbapi.setDeviceApp = function(message) {
export const setDeviceApp = function(message) {
  return dbapi.loadDeviceBySerial(message.serial)
    .then(result => {
      let removePathApp = ''
      let {installedApps} = result
      let index = installedApps.findIndex(item => {
        return (
          item.bundleName === message.bundleName &&
          item.bundleId === message.bundleId
        )
      })
      if(index >= 0) {
        removePathApp = installedApps[index].pathToApp

        installedApps[index] = {
          bundleId: message.bundleId
          , bundleName: message.bundleName
          , pathToApp: message.pathToApp
        }
        db.run(r.table('devices').get(message.serial).update({
          installedApps
        }))
        return Promise.resolve({removePathApp})
      }
      else {
        db.run(r.table('devices').get(message.serial).update({
          installedApps: r.row('installedApps').default([]).append({
            bundleId: message.bundleId
            , bundleName: message.bundleName
            , pathToApp: message.pathToApp
          })
        }))
        return Promise.resolve({removePathApp: ''})
      }
    })
    .catch(err => {
      db.run(r.table('devices').get(message.serial).update({
        installedApps: r.row('installedApps').default([]).append({
          bundleId: message.bundleId
          , bundleName: message.bundleName
          , pathToApp: message.pathToApp
        })
      }))
      return Promise.reject(err)
    })
}*/

// dbapi.getInstalledApplications = function(message) {
export const getInstalledApplications = function(message) {
    return trace('getInstalledApplications', {message}, () => {
        return loadDeviceBySerial(message.serial)
    })
}

// dbapi.getDeviceGroupOwner = function(serial) {
export const getDeviceGroupOwner = function(serial) {
    return trace('getDeviceGroupOwner', {serial}, () => {
        return db.connect().then(client => {
            return client.collection('devices').findOne({serial: serial})
                .then(result => {
                    return result.group.owner
                })
        })
    })
}

// dbapi.setDeviceGroupOwner = function(message) {
export const setDeviceGroupOwner = function(message) {
    return trace('setDeviceGroupOwner', {message}, () => {
        let data = {
            'group.owner.email': process.env.STF_ADMIN_EMAIL || 'administrator@fakedomain.com'
            , 'group.owner.name': process.env.STF_ADMIN_NAME || 'administrator'
        }
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {serial: message.serial},
                {
                    $set: data
                }
            )
        })
    })
}

// dbapi.setDeviceType = function(serial, type) {
export const setDeviceType = function(serial, type) {
    return trace('setDeviceType', {serial, type}, () => {
        return db.connect().then(client => {
            return client.collection('devices').updateOne(
                {
                    serial: serial
                },
                {
                    $set: {
                        deviceType: type
                    }
                }
            )
        })
    })
}

// dbapi.getDeviceType = function(serial) {
export const getDeviceType = function(serial) {
    return trace('getDeviceType', {serial}, () => {
        return db.connect().then(client => {
            return client.collection('devices').findOne({serial: serial})
                .then(result => {
                    return result.deviceType
                })
        })
    })
}

// dbapi.initializeIosDeviceState = function(publicIp, message) {
export const initializeIosDeviceState = function(publicIp, message) {
    return trace('initializeIosDeviceState', {publicIp, message}, () => {
        const screenWsUrlPattern =
        message.provider.screenWsUrlPattern || `ws://${publicIp}:${message.ports.screenPort}/`

        const data = {
            present: true
            , presenceChangedAt: getNow()
            , provider: message.provider
            , owner: null
            , status: message.status
            , statusChangedAt: getNow()
            , ready: true
            , reverseForwards: []
            , remoteConnect: false
            , remoteConnectUrl: null
            , usage: null
            , ios: true
            , display: {
                density: DEFAULT_IOS_DEVICE_ARGS.DENSITY
                , fps: DEFAULT_IOS_DEVICE_ARGS.FPS
                , id: DEFAULT_IOS_DEVICE_ARGS.ID
                , rotation: DEFAULT_IOS_DEVICE_ARGS.ROTATION
                , secure: DEFAULT_IOS_DEVICE_ARGS.SECURE
                , size: DEFAULT_IOS_DEVICE_ARGS.SIZE
                , xdpi: DEFAULT_IOS_DEVICE_ARGS.XDPI
                , ydpi: DEFAULT_IOS_DEVICE_ARGS.YDPI
                , url: screenWsUrlPattern
            }
            , 'group.owner.email': process.env.STF_ADMIN_EMAIL || 'administrator@fakedomain.com'
            , 'group.owner.name': process.env.STF_ADMIN_NAME || 'administrator'
            , screenPort: message.ports.screenPort
            , connectPort: message.ports.connectPort
            , model: message.options.name
            , platform: message.options.platform
            , sdk: message.options.architect
            , abi: 'arm64'
        }

        return db.connect().then(client => {
            return client.collection('devices').updateOne({serial: message.serial},
                {
                    $set: data
                }
            )
                .then(stats => {
                    if (stats.modifiedCount === 0 && stats.matchedCount === 0) {
                        return getRootGroup().then(function(group) {
                            data.serial = message.serial
                            data.createdAt = getNow()
                            data.group = {
                                id: group.id
                                , name: group.name
                                , lifeTime: group.dates[0]
                                , owner: group.owner
                                , origin: group.id
                                , class: group.class
                                , repetitions: group.repetitions
                                , originName: group.name
                                , lock: false
                            }
                            return client.collection('devices').insertOne(data)
                                .then(() => {
                                    return addOriginGroupDevice(group, message.serial)
                                })
                        })
                    }
                    return true
                })
                .then(() => {
                    return client.collection('devices').findOne({serial: message.serial})
                })
        })
    })
}

export default {
    DuplicateSecondaryIndexError
    , unlockBookingObjects
    , getNow
    , createBootStrap
    , deleteDevice
    , deleteUser
    , getReadyGroupsOrderByIndex
    , getGroupsByIndex
    , getGroupByIndex
    , getGroupsByUser
    , getGroup
    , getGroups
    , getUsers
    , getEmails
    , addGroupUser
    , getAdmins
    , addAdminsToGroup
    , removeGroupUser
    , lockDeviceByCurrent
    , lockDeviceByOrigin
    , addOriginGroupDevice
    , removeOriginGroupDevice
    , addGroupDevices
    , removeGroupDevices
    , lockDevice
    , lockDevices
    , unlockDevice
    , unlockDevices
    , setLockOnDevices
    , lockUser
    , unlockUser
    , lockGroupByOwner
    , lockGroup
    , unlockGroup
    , adminLockGroup
    , adminUnlockGroup
    , getRootGroup
    , getUserGroup
    , getUserGroups
    , getOnlyUserGroups
    , getTransientGroups
    , getDeviceTransientGroups
    , isDeviceBooked
    , isRemoveGroupUserAllowed
    , isUpdateDeviceOriginGroupAllowed
    , getDeviceGroups
    , getGroupAsOwnerOrAdmin
    , getOwnerGroups
    , createGroup
    , createUserGroup
    , updateGroup
    , reserveUserGroupInstance
    , releaseUserGroupInstance
    , updateUserGroupDuration
    , updateUserGroupsQuotas
    , updateDefaultUserGroupsQuotas
    , updateDeviceGroupName
    , updateDeviceCurrentGroupFromOrigin
    , askUpdateDeviceOriginGroup
    , updateDeviceOriginGroup
    , updateDeviceCurrentGroup
    , updateDevicesCurrentGroup
    , returnDeviceToOriginGroup
    , returnDevicesToOriginGroup
    , updateUserGroup
    , deleteGroup
    , deleteUserGroup
    , createUser
    , saveUserAfterLogin
    , loadUser
    , updateUsersAlertMessage
    , updateUserSettings
    , resetUserSettings
    , insertUserAdbKey
    , deleteUserAdbKey
    , lookupUsersByAdbKey
    , lookupUserByAdbFingerprint
    , lookupUserByVncAuthResponse
    , loadUserDevices
    , saveDeviceLog
    , saveDeviceInitialState
    , setDeviceConnectUrl
    , unsetDeviceConnectUrl
    , saveDeviceStatus
    , enhanceStatusChangedAt
    , setDeviceOwner
    , setDevicePlace
    , setDeviceStorageId
    , unsetDeviceOwner
    , setDevicePresent
    , setDeviceAbsent
    , setDeviceUsage
    , unsetDeviceUsage
    , setDeviceAirplaneMode
    , setDeviceBattery
    , setDeviceBrowser
    , setDeviceServicesAvailability
    , setDeviceConnectivity
    , setDevicePhoneState
    , setDeviceRotation
    , setDeviceNote
    , setDeviceReverseForwards
    , setDeviceReady
    , saveDeviceIdentity
    , loadDevices
    , loadDevicesByOrigin
    , loadBookableDevices
    , loadBookableDevicesWithFiltersLock
    , loadStandardDevices
    , loadPresentDevices
    , loadDeviceBySerial
    , loadDevicesBySerials
    , loadDevice
    , loadBookableDevice
    , loadDeviceByCurrent
    , loadDeviceByOrigin
    , saveUserAccessToken
    , removeUserAccessTokens
    , removeUserAccessToken
    , removeAccessToken
    , loadAccessTokens
    , loadAccessToken
    , grantAdmin
    , revokeAdmin
    , makeOriginGroupBookable
    , acceptPolicy
    , writeStats
    , getDevicesCount
    , getOfflineDevicesCount
    , getOfflineDevices
    , isPortExclusive
    , getLastAdbPort
    , getAllocatedAdbPorts
    , initiallySetAdbPort
    , setAdbPort
    , getAdbRange
    , getFreeAdbPort
    , generateIndexes
    , setDeviceSocketDisplay
    , setDeviceSocketPorts
    , updateIosDevice
    , setDeviceIosVersion
    , sizeIosDevice
    , getDeviceDisplaySize
    , setAbsentDisconnectedDevices
    // , setDeviceApp
    , getInstalledApplications
    , getDeviceGroupOwner
    , setDeviceGroupOwner
    , setDeviceType
    , getDeviceType
    , initializeIosDeviceState
}
