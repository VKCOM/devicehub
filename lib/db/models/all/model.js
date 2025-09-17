/* *
 * Copyright 2025 contains code contributed by V Kontakte LLC - Licensed under the Apache license 2.0
 * */

import util from 'util'
import db from '../../index.js'
import wireutil from '../../../wire/util.js'
import {v4 as uuidv4} from 'uuid'
import * as apiutil from '../../../util/apiutil.js'
import GroupModel from '../group/index.js'

import logger from '../../../util/logger.js'
import {getRootGroup, getGroup} from '../group/model.js'

const log = logger.createLogger('dbapi')

const DEFAULT_IOS_DEVICE_ARGS = {
    DENSITY: 2,
    FPS: 60,
    ID: 0,
    ROTATION: 0,
    SECURE: true,
    SIZE: 4.971253395080566,
    XDPI: 294.9670104980469,
    YDPI: 295.56298828125
}

// dbapi.DuplicateSecondaryIndexError = function DuplicateSecondaryIndexError() {
export const DuplicateSecondaryIndexError = function DuplicateSecondaryIndexError() {
    Error.call(this)
    this.name = 'DuplicateSecondaryIndexError'
    Error.captureStackTrace(this, DuplicateSecondaryIndexError)
}

util.inherits(DuplicateSecondaryIndexError, Error)

/**
 * @deprecated Do not use locks in database.
 */
export const unlockBookingObjects = function() {
    return Promise.all([
        db.users.updateMany(
            {},
            {
                $set: {'groups.lock': false}
            }
        ),
        db.devices.updateMany(
            {},
            {
                $set: {'group.lock': false}
            }
        ),
        db.collection('groups').updateMany(
            {},
            {
                $set: {
                    'lock.user': false,
                    'lock.admin': false
                }
            }
        )
    ])
}

// dbapi.getNow = function() {
export const getNow = function() {
    return new Date()
}


// dbapi.createBootStrap = function(env) {
export const createBootStrap = function(env) {
    const now = Date.now()

    function updateUsersForMigration(group) {
        return getUsers().then(function(users) {
            return Promise.all(users.map(async(user) => {
                const data = {
                    privilege: user?.email !== group?.owner.email ? apiutil.USER : apiutil.ADMIN,
                    'groups.subscribed': [],
                    'groups.lock': false,
                    'groups.quotas.allocated.number': group?.envUserGroupsNumber,
                    'groups.quotas.allocated.duration': group?.envUserGroupsDuration,
                    'groups.quotas.consumed.duration': 0,
                    'groups.quotas.consumed.number': 0,
                    'groups.quotas.defaultGroupsNumber': user?.email !== group?.owner.email ? 0 : group?.envUserGroupsNumber,
                    'groups.quotas.defaultGroupsDuration': user?.email !== group?.owner.email ? 0 : group?.envUserGroupsDuration,
                    'groups.quotas.defaultGroupsRepetitions': user?.email !== group?.owner.email ? 0 : group?.envUserGroupsRepetitions,
                    'groups.quotas.repetitions': group?.envUserGroupsRepetitions
                }

                await db.users.updateOne(
                    {email: user?.email},
                    {
                        $set: data
                    }
                ).then(stats => {
                    if (stats.modifiedCount > 0) {
                        return GroupModel.addGroupUser(group?.id, user?.email)
                    }
                })
            }))
        })
    }

    function getDevices() {
        return db.devices.find().toArray()
    }

    function updateDevicesForMigration(group) {
        return getDevices().then(function(devices) {
            return Promise.all(devices.map(device => {
                log.info(`Migrating device ${device.serial}`)
                const data = {
                    'group.id': group?.id,
                    'group.name': group?.name,
                    'group.lifeTime': group?.lifeTime,
                    'group.owner': group?.owner,
                    'group.origin': group?.origin,
                    'group.class': group?.class,
                    'group.repetitions': group?.repetitions,
                    'group.originName': group?.originName,
                    'group.lock': false
                }
                return db.devices.updateOne(
                    {serial: device.serial},
                    {
                        $set: data
                    }
                    // @ts-ignore
                ).then(stats => {
                    if (stats.modifiedCount > 0) {
                        return GroupModel.addOriginGroupDevice(group, device.serial)
                    }
                    return stats
                })
            }))
        })
    }

    return GroupModel.createGroup({
        name: env.STF_ROOT_GROUP_NAME,
        owner: {
            email: env.STF_ADMIN_EMAIL,
            name: env.STF_ADMIN_NAME
        },
        users: [env.STF_ADMIN_EMAIL],
        privilege: apiutil.ROOT,
        class: apiutil.BOOKABLE,
        repetitions: 0,
        duration: 0,
        isActive: true,
        state: apiutil.READY,
        dates: [{
            start: new Date(now),
            stop: new Date(now + apiutil.TEN_YEARS)
        }],
        envUserGroupsNumber: apiutil.MAX_USER_GROUPS_NUMBER,
        envUserGroupsDuration: apiutil.MAX_USER_GROUPS_DURATION,
        envUserGroupsRepetitions: apiutil.MAX_USER_GROUPS_REPETITIONS
    })
        .then(function(group) {
            return saveUserAfterLogin({
                name: group?.owner.name,
                email: group?.owner.email,
                ip: '127.0.0.1'
            })
                .then(function() {
                    return updateUsersForMigration(group)
                })
                .then(function() {
                    return updateDevicesForMigration(group)
                })
                .then(function() {
                    return reserveUserGroupInstance(group?.owner?.email)
                })
        })
}

// dbapi.deleteDevice = function(serial) {
export const deleteDevice = function(serial) {
    return db.devices.deleteOne({serial: serial})
}

export const deleteUser = function(email) {
    return db.users.deleteOne({email: email})
}

// dbapi.getUsers = function() {
export const getUsers = function() {
    return db.users.find().toArray()
}

// dbapi.getEmails = function() {
export const getEmails = function() {
    return db.users
        .find({
            privilege: {
                $ne: apiutil.ADMIN
            }
        })
        .project({email: 1, _id: 0})
        .toArray()
}

// dbapi.getAdmins = function() {
export const getAdmins = function() {
    return db.users
        .find({
            privilege: apiutil.ADMIN
        })
        .project({email: 1, _id: 0})
        .toArray()
}

export const lockDeviceByCurrent = function(groups, serial) {
    function wrappedlockDeviceByCurrent() {
        return db.devices.findOne({serial: serial}).then(oldDoc => {
            return db.devices.updateOne(
                {serial: serial},
                [{
                    $set: {
                        'group.lock': {
                            $cond: [
                                {
                                    $and: [
                                        {$eq: ['$group?.lock', false]},
                                        {$not: [{$eq: [{$setIntersection: [groups, ['$group?.id']]}, []]}]}
                                    ]
                                },
                                true,
                                '$group?.lock'
                            ]
                        }
                    }
                }]
            ).then(updateStats => {
                return db.devices.findOne({serial: serial}).then(newDoc => {
                    // @ts-ignore
                    updateStats.changes = [
                        {new_val: {...newDoc}, old_val: {...oldDoc}}
                    ]
                    return updateStats
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
}

// dbapi.lockDeviceByOrigin = function(groups, serial) {
export const lockDeviceByOrigin = function(groups, serial) {
    function wrappedlockDeviceByOrigin() {
        return db.devices.findOne({serial: serial}).then(oldDoc => {
            return db.devices.updateOne(
                {serial: serial},
                [{
                    $set: {
                        'group.lock': {
                            $cond: [
                                {
                                    $and: [
                                        {$eq: ['$group?.lock', false]},
                                        {$not: [{$eq: [{$setIntersection: [groups, ['$group?.origin']]}, []]}]}
                                    ]
                                },
                                true,
                                '$group?.lock'
                            ]
                        }
                    }
                }]
            ).then(updateStats => {
                return db.devices.findOne({serial: serial}).then(newDoc => {
                    // @ts-ignore
                    updateStats.changes = [
                        {new_val: {...newDoc}, old_val: {...oldDoc}}
                    ]
                    return updateStats
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
}

/**
 * @deprecated Do not use locks in database.
 */
function setLockOnDevice(serial, state) {
    return db.devices.findOne({serial: serial}).then(device => {
        return db.devices.updateOne({
            serial: serial
        }, {
            $set: {'group.lock': device?.group?.lock !== state ? state : device?.group?.lock}
        })
    })
}

/**
 * @deprecated Do not use locks in database.
 */
export const lockDevice = function(serial) {
    return setLockOnDevice(serial, true)
}

/**
 * @deprecated Do not use locks in database.
 */
export const lockDevices = function(serials) {
    return setLockOnDevices(serials, true)
}

// dbapi.unlockDevice = function(serial) {
export const unlockDevice = function(serial) {
    return setLockOnDevice(serial, false)
}

// dbapi.unlockDevices = function(serials) {
export const unlockDevices = function(serials) {
    return setLockOnDevices(serials, false)
}

/**
 * @deprecated Do not use locks in database.
 */
export const setLockOnDevices = function(serials, lock) {
    return db.devices.updateMany(
        {serial: {$in: serials}}
        , {
            $set: {
                'group.lock': lock
            }
        }
    )
}

/**
 * @deprecated Do not use locks in database.
 */
function setLockOnUser(email, state) {
    return db.users.findOne({email: email}).then(oldDoc => {
        if (!oldDoc || !oldDoc.groups) {
            throw new Error(`User with email ${email} not found or groups field is missing.`)
        }
        return db.users.updateOne(
            {email: email},
            {
                $set: {
                    'groups.lock': oldDoc.groups.lock !== state ? state : oldDoc.groups.lock
                }
            }
        )
            .then(updateStats => {
                return db.users.findOne({email: email}).then(newDoc => {
                    // @ts-ignore
                    updateStats.changes = [
                        {new_val: {...newDoc}, old_val: {...oldDoc}}
                    ]
                    return updateStats
                })
            })
    })
}


// dbapi.lockUser = function(email) {
export const lockUser = function(email) {
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
}

// dbapi.unlockUser = function(email) {
export const unlockUser = function(email) {
    return setLockOnUser(email, false)
}

// dbapi.isDeviceBooked = function(serial) {
export const isDeviceBooked = function(serial) {
    return GroupModel.getDeviceTransientGroups(serial)
        .then(groups => !!groups?.length)
}

// dbapi.createUser = function(email, name, ip) {
export const createUser = function(email, name, ip, privilege) {
    return GroupModel.getRootGroup().then(function(group) {
        return loadUser(group?.owner.email).then(function(adminUser) {
            let userObj = {
                email: email,
                name: name,
                ip: ip,
                group: wireutil.makePrivateChannel(),
                lastLoggedInAt: getNow(),
                createdAt: getNow(),
                forwards: [],
                settings: {},
                acceptedPolicy: false,
                privilege: privilege || (adminUser ? apiutil.USER : apiutil.ADMIN),
                groups: {
                    subscribed: [],
                    lock: false,
                    quotas: {
                        allocated: {
                            number: adminUser ? adminUser.groups.quotas.defaultGroupsNumber : group?.envUserGroupsNumber,
                            duration: adminUser ? adminUser.groups.quotas.defaultGroupsDuration : group?.envUserGroupsDuration
                        },
                        consumed: {
                            number: 0,
                            duration: 0
                        },
                        defaultGroupsNumber: adminUser ? 0 : group?.envUserGroupsNumber,
                        defaultGroupsDuration: adminUser ? 0 : group?.envUserGroupsDuration,
                        defaultGroupsRepetitions: adminUser ? 0 : group?.envUserGroupsRepetitions,
                        repetitions: adminUser ? adminUser.groups.quotas.defaultGroupsRepetitions : group?.envUserGroupsRepetitions
                    }
                }
            }
            return db.users.insertOne(userObj)
                .then(function(stats) {
                    if (stats.insertedId) {
                        return GroupModel.addGroupUser(group?.id, email).then(function() {
                            return loadUser(email).then(function(user) {
                                // @ts-ignore
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
}

// dbapi.saveUserAfterLogin = function(user) {
export const saveUserAfterLogin = function(user) {
    const updateData = {
        name: user?.name,
        ip: user?.ip,
        lastLoggedInAt: getNow()
    }

    if (user?.privilege) {
        updateData.privilege = user?.privilege
    }

    return db.users.updateOne({email: user?.email}, {$set: updateData})
        // @ts-ignore
        .then(stats => {
            if (stats.modifiedCount === 0) {
                return createUser(user?.email, user?.name, user?.ip, user?.privilege)
            }
            return stats
        })
}

// dbapi.loadUser = function(email) {
export const loadUser = function(email) {
    return db.users.findOne({email: email})
}

// dbapi.updateUsersAlertMessage = function(alertMessage) {
export const updateUsersAlertMessage = function(alertMessage) {
    return db.users.updateOne(
        {
            email: apiutil.STF_ADMIN_EMAIL
        }
        , {
            $set: Object.fromEntries(Object.entries(alertMessage).map(([key, value]) =>
                ['settings.alertMessage.' + key, value]
            )),
        }
    ).then(updateStats => {
        return db.users.findOne({email: apiutil.STF_ADMIN_EMAIL}).then(updatedMainAdmin => {
            // @ts-ignore
            updateStats.changes = [
                {new_val: {...updatedMainAdmin}}
            ]
            return updateStats
        })
    })
}

// dbapi.updateUserSettings = function(email, changes) {
export const updateUserSettings = function(email, changes) {
    return db.users.findOne({email: email}).then(user => {
        return db.users.updateOne(
            {
                email: email
            }
            , {
                $set: {
                    settings: {...user?.settings, ...changes}
                }
            }
        )
    })
}

// dbapi.resetUserSettings = function(email) {
export const resetUserSettings = function(email) {
    return db.users.updateOne({email: email},
        {
            $set: {
                settings: {}
            }
        })
}

// dbapi.insertUserAdbKey = function(email, key) {
export const insertUserAdbKey = function(email, key) {
    let data = {
        title: key.title,
        fingerprint: key.fingerprint
    }
    return db.users.findOne({email: email}).then(user => {
        let adbKeys = user?.adbKeys ? user?.adbKeys : []
        adbKeys.push(data)
        return db.users.updateOne(
            {email: email}
            , {$set: {adbKeys: user?.adbKeys ? adbKeys : [data]}}
        )
    })
}

// dbapi.deleteUserAdbKey = function(email, fingerprint) {
export const deleteUserAdbKey = function(email, fingerprint) {
    return db.users.findOne({email: email}).then(user => {
        return db.users.updateOne(
            {email: email}
            , {
                $set: {
                    adbKeys: user?.adbKeys ? user?.adbKeys.filter(key => {
                        return key.fingerprint !== fingerprint
                    }) : []
                }
            }
        )
    })
}

// dbapi.lookupUsersByAdbKey = function(fingerprint) {
export const lookupUsersByAdbKey = function(fingerprint) {
    return db.users.find({
        adbKeys: fingerprint
    }).toArray()
}

// dbapi.lookupUserByAdbFingerprint = function(fingerprint) {
export const lookupUserByAdbFingerprint = function(fingerprint) {
    return db.users.find(
        {adbKeys: {$elemMatch: {fingerprint: fingerprint}}}
        // @ts-ignore
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
}

// dbapi.lookupUserByVncAuthResponse = function(response, serial) {
export const lookupUserByVncAuthResponse = function(response, serial) {
    return db.collection('vncauth').aggregate([
        {
            $match: {
                'responsePerDevice.response': response,
                'responsePerDevice.serial': serial
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                as: 'users'
            }
        },
        {
            $project: {
                email: 1,
                name: 1,
                group: 1
            }
        }
    ]).toArray()
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
}

// dbapi.loadUserDevices = function(email) {
export const loadUserDevices = function(email) {
    return db.users.findOne({email: email}).then(user => {
        let userGroups = user?.groups.subscribed
        return db.devices.find(
            {
                'owner.email': email,
                present: true,
                'group.id': {$in: userGroups}
            }
        ).toArray()
    })
}

// dbapi.saveDeviceLog = function(serial, entry) {
export const saveDeviceLog = function(serial, entry) {
    return db.connect().then(() =>
        db.collection('logs').insertOne({
            id: uuidv4(),
            serial: serial,
            timestamp: new Date(entry.timestamp),
            priority: entry.priority,
            tag: entry.tag,
            pid: entry.pid,
            message: entry.message
        })
    )
}

// dbapi.saveDeviceInitialState = function(serial, device) {
export const saveDeviceInitialState = function(serial, device) {
    let data = {
        present: true,
        presenceChangedAt: getNow(),
        provider: device.provider,
        owner: null,
        channel: null,
        status: 1,
        statusChangedAt: getNow(),
        bookedBefore: 0,
        ready: true,
        reverseForwards: [],
        remoteConnect: false,
        remoteConnectUrl: null,
        usage: null,
        logs_enabled: false,
        ...device
    }
    return db.devices.updateOne({serial: serial},
        {
            $set: data
        }
    )
        // @ts-ignore
        .then(stats => {
            if (stats.modifiedCount === 0 && stats.matchedCount === 0) {
                return GroupModel.getRootGroup().then(function(group) {
                    data.serial = serial
                    data.createdAt = getNow()
                    data.group = {
                        id: group?.id,
                        name: group?.name,
                        lifeTime: group?.dates[0],
                        owner: group?.owner,
                        origin: group?.id,
                        class: group?.class,
                        repetitions: group?.repetitions,
                        originName: group?.name,
                        lock: false
                    }
                    return db.devices.insertOne(data)
                        .then(() => {
                            return GroupModel.addOriginGroupDevice(group, serial)
                        })
                })
            }
            return true
        })
        .then(() => {
            return db.devices.findOne({serial: serial})
        })
}

// dbapi.setDeviceConnectUrl = function(serial, url) {
export const setDeviceConnectUrl = function(serial, url) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {
                remoteConnectUrl: url,
                remoteConnect: true
            }
        }
    )
}

// dbapi.unsetDeviceConnectUrl = function(serial) {
export const unsetDeviceConnectUrl = function(serial) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {
                remoteConnectUrl: null,
                remoteConnect: false
            }
        }
    )
}

// dbapi.saveDeviceStatus = function(serial, status) {
export const saveDeviceStatus = function(serial, status) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {
                status: status,
                statusChangedAt: getNow()
            }
        }
    )
}

// dbapi.enhanceStatusChangedAt = function(serial, timeout) {
export const enhanceStatusChangedAt = function(serial, timeout) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {
                statusChangedAt: getNow(),
                bookedBefore: timeout
            }
        }
    )
}

// dbapi.setDeviceOwner = function(serial, owner) {
export const setDeviceOwner = function(serial, owner) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {owner: owner}
        }
    )
}

// dbapi.setDevicePlace = function(serial, place) {
export const setDevicePlace = function(serial, place) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {place: place}
        }
    )
}

// dbapi.setDeviceStorageId = function(serial, storageId) {
export const setDeviceStorageId = function(serial, storageId) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {storageId: storageId}
        }
    )
}


// dbapi.unsetDeviceOwner = function(serial) {
export const unsetDeviceOwner = function(serial) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {owner: null}
        }
    )
}

// dbapi.setDevicePresent = function(serial) {
export const setDevicePresent = function(serial) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {
                present: true,
                presenceChangedAt: getNow()
            }
        }
    )
}

// dbapi.setDeviceAbsent = function(serial) {
export const setDeviceAbsent = function(serial) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {
                owner: null,
                present: false,
                presenceChangedAt: getNow()
            }
        }
    )
}

// dbapi.setDeviceUsage = function(serial, usage) {
export const setDeviceUsage = function(serial, usage) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {
                usage: usage,
                usageChangedAt: getNow()
            }
        }
    )
}

// dbapi.unsetDeviceUsage = function(serial) {
export const unsetDeviceUsage = function(serial) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {
                usage: null,
                usageChangedAt: getNow(),
                logs_enabled: false
            }
        }
    )
}

// dbapi.setDeviceAirplaneMode = function(serial, enabled) {
export const setDeviceAirplaneMode = function(serial, enabled) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {
                airplaneMode: enabled
            }
        }
    )
}

// dbapi.setDeviceBattery = function(serial, battery) {
export const setDeviceBattery = function(serial, battery) {
    const batteryData = {
        status: battery.status,
        health: battery.health,
        source: battery.source,
        level: battery.level,
        scale: battery.scale,
        temp: battery.temp,
        voltage: battery.voltage
    }
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {battery: batteryData}
        }
    )
}

// dbapi.setDeviceBrowser = function(serial, browser) {
export const setDeviceBrowser = function(serial, browser) {
    const browserData = {
        selected: browser.selected,
        apps: browser.apps
    }

    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {browser: browserData}
        }
    )
}

// dbapi.setDeviceServicesAvailability = function(serial, service) {
export const setDeviceServicesAvailability = function(serial, service) {
    const serviceData = {
        hasHMS: service.hasHMS,
        hasGMS: service.hasGMS
    }
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {service: serviceData}
        }
    )
}

// dbapi.setDeviceConnectivity = function(serial, connectivity) {
export const setDeviceConnectivity = function(serial, connectivity) {
    const networkData = {
        connected: connectivity.connected,
        type: connectivity.type,
        subtype: connectivity.subtype,
        failover: !!connectivity.failover,
        roaming: !!connectivity.roaming
    }
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {network: networkData}
        }
    )
}

// dbapi.setDevicePhoneState = function(serial, state) {
export const setDevicePhoneState = function(serial, state) {
    const networkData = {
        state: state.state,
        manual: state.manual,
        operator: state.operator
    }
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {network: networkData}
        }
    )
}

// dbapi.setDeviceRotation = function(serial, rotation) {
export const setDeviceRotation = function(message) {
    const setObj = {
        'display.rotation': message.rotation
    }
    if (message.height !== null) {
        setObj['display.height'] = message.height
        setObj['display.width'] = message.width
    }
    return db.devices.updateOne(
        {serial: message.serial},
        {
            $set: setObj
        }
    )
}


export const setDeviceCapabilities = function(message) {
    const setObj = {
        capabilities: {
            hasCursor: message.hasCursor,
            hasTouch: message.hasTouch
        }
    }
    return db.devices.updateOne(
        {serial: message.serial},
        {
            $set: setObj
        }
    )
}

// dbapi.setDeviceNote = function(serial, note) {
export const setDeviceNote = function(serial, note) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {notes: note}
        }
    )
}

// dbapi.setDeviceReverseForwards = function(serial, forwards) {
export const setDeviceReverseForwards = function(serial, forwards) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {reverseForwards: forwards}
        }
    )
}

// dbapi.setDeviceReady = function(serial, channel) {
export const setDeviceReady = function(serial, channel) {
    const data = {
        channel: channel,
        ready: true,
        owner: null,
        present: true,
        reverseForwards: []
    }
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: data
        }
    )
}

// dbapi.saveDeviceIdentity = function(serial, identity) {
export const saveDeviceIdentity = function(serial, identity) {
    const identityData = {
        platform: identity.platform,
        manufacturer: identity.manufacturer,
        operator: identity.operator,
        model: identity.model,
        version: identity.version,
        abi: identity.abi,
        sdk: identity.sdk,
        display: identity.display,
        phone: identity.phone,
        product: identity.product,
        cpuPlatform: identity.cpuPlatform,
        openGLESVersion: identity.openGLESVersion,
        marketName: identity.marketName,
        macAddress: identity.macAddress,
        ram: identity.ram
    }

    return db.devices.updateOne(
        {serial: serial},
        {
            $set: identityData
        }
    )
}

const findWithFields = function(collection, condition, fields) {
    return collection.find(condition).project(fields).toArray()
}

const findOneWithFields = function(collection, condition) {
    return collection.findOne(condition)
}

const findDevice = function(condition, fields) {
    if (Object.keys(condition).includes('serial')) {
        return findOneWithFields(db.devices, condition)
    }
    return findWithFields(db.devices, condition, fields)
}

// dbapi.loadDevices = function(groups) {
export const loadDevices = function(groups, fields) {
    if (groups && groups.length > 0) {
        return findDevice({'group.id': {$in: groups}}, fields)
    }
    else {
        return findDevice({}, fields)
    }
}

// dbapi.loadDevicesByOrigin = function(groups) {
export const loadDevicesByOrigin = function(groups, fields) {
    return findDevice({'group.origin': {$in: groups}}, fields)
}

// dbapi.loadBookableDevices = function(groups) {
export const loadBookableDevices = function(groups, fields) {
    return findDevice({
        $and: [
            {'group.origin': {$in: groups}},
            {present: {$eq: true}},
            {ready: {$eq: true}},
            {owner: {$eq: null}}
        ]
    }, fields)
}

export const loadBookableDevicesWithFiltersLock = function(groups, filters, devicesFunc, limit = null) {
    const filterOptions = []
    let serials = []

    // Process dynamic filters
    if (filters && typeof filters === 'object') {
        Object.entries(filters).forEach(([field, condition]) => {
            if (condition !== null && condition !== undefined) {
                // Support both simple values and MongoDB operators
                if (typeof condition === 'object' && !Array.isArray(condition)) {
                    // Handle MongoDB operators like {$ne: value}, {$not: {$eq: value}}, etc.
                    filterOptions.push({[field]: condition})
                }
                else {
                    // Handle simple equality for backwards compatibility
                    filterOptions.push({[field]: {$eq: condition}})
                }
            }
        })
    }

    const pipeline = [
        {
            $match: {
                $and: [
                    {'group.origin': {$in: groups}},
                    {'group.class': {$eq: apiutil.BOOKABLE}},
                    {present: {$eq: true}},
                    {ready: {$eq: true}},
                    {status: {$eq: 3}},
                    {owner: {$eq: null}},
                    {'group.lock': {$eq: false}},
                    ...filterOptions
                ]
            }
        }
    ]
    if (limit) {
        // @ts-ignore
        pipeline.push({$sample: {size: limit}})
    }

    return db.devices.aggregate(pipeline).toArray()
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
}

// dbapi.loadStandardDevices = function(groups) {
export const loadStandardDevices = function(groups, fields) {
    return findDevice({
        'group.class': apiutil.STANDARD,
        'group.id': {$in: groups}
    }, fields)
}

// dbapi.loadPresentDevices = function() {
export const loadPresentDevices = function() {
    return db.devices.find({present: true}).toArray()
}

// dbapi.loadDeviceBySerial = function(serial) {
export const loadDeviceBySerial = function(serial) {
    return findDevice({serial: serial})
}

// dbapi.loadDevicesBySerials = function(serials) {
export const loadDevicesBySerials = function(serials) {
    return db.devices.find({serial: {$in: serials}}).toArray()
}

// dbapi.loadDevice = function(groups, serial) {
export const loadDevice = function(groups, serial) {
    return findDevice({
        serial: serial,
        'group.id': {$in: groups}
    })
}

// dbapi.loadBookableDevice = function(groups, serial) {
export const loadBookableDevice = function(groups, serial) {
    return db.devices
        .find(
            {
                serial: serial,
                'group.origin': {$in: groups},
                'group.class': {$ne: apiutil.STANDARD}
            }
        )
        .toArray()
}

// dbapi.loadDeviceByCurrent = function(groups, serial) {
export const loadDeviceByCurrent = function(groups, serial) {
    return db.devices
        .find(
            {
                serial: serial,
                'group.id': {$in: groups}
            }
        )
        .toArray()
}

// dbapi.loadDeviceByOrigin = function(groups, serial) {
export const loadDeviceByOrigin = function(groups, serial) {
    return db.devices
        .find(
            {
                serial: serial,
                'group.origin': {$in: groups}
            }
        )
        .toArray()
}

// dbapi.saveUserAccessToken = function(email, token) {
export const saveUserAccessToken = function(email, token) {
    let tokenId = token.id
    return db.collection('accessTokens').insertOne(
        {
            email: email,
            id: token.id,
            title: token.title,
            jwt: token.jwt
        }).then(function(result) {
        if (result.insertedId) {
            return tokenId
        }
        else {
            throw Error('AccessToken have not saved at database. Check MongoDB logs')
        }
    })
}

// dbapi.removeUserAccessTokens = function(email) {
export const removeUserAccessTokens = function(email) {
    return db.collection('accessTokens').deleteMany(
        {
            email: email
        }
    )
}

// dbapi.removeUserAccessToken = function(email, title) {
export const removeUserAccessToken = function(email, title) {
    return db.collection('accessTokens').deleteOne(
        {
            email: email,
            title: title
        }
    )
}

// dbapi.removeAccessToken = function(id) {
export const removeAccessToken = function(id) {
    return db.collection('accessTokens').deleteOne({id: id})
}

// dbapi.loadAccessTokens = function(email) {
export const loadAccessTokens = function(email) {
    return db.collection('accessTokens').find({email: email}).toArray()
}

// dbapi.loadAccessToken = function(id) {
export const loadAccessTokenById = function(id) {
    return db.collection('accessTokens').findOne({id: id})
}

export const loadAccessTokenByJwt = function(jwt) {
    return db.collection('accessTokens').findOne({jwt: jwt})
}

export const loadAccessTokenByTitle = function(email, title) {
    return db.collection('accessTokens').findOne({email: email, title: title})
}

// dbapi.grantAdmin = function(email) {
export const grantAdmin = function(email) {
    return db.users.findOneAndUpdate({email: email}, {
        $set: {
            privilege: apiutil.ADMIN
        }
    }, {returnDocument: 'after'})
}

// dbapi.revokeAdmin = function(email) {
export const revokeAdmin = function(email) {
    return db.users.findOneAndUpdate({email: email}, {
        $set: {
            privilege: apiutil.USER
        }
    }, {returnDocument: 'after'})
}

// dbapi.acceptPolicy = function(email) {
export const acceptPolicy = function(email) {
    return db.users.updateOne({email: email}, {
        $set: {
            acceptedPolicy: true
        }
    })
}

// dbapi.writeStats = function(user, serial, action) {
// {
//   event_type: string,
//   event_details: object,
//   linked_entities: {
//     device_serial: string,
//     user_email: string,
//     group_id: string
//   }
//   timestamp: number
// }
/**
 * @typedef {Object} LinkedEntities
 * @property {string?} deviceSerial - The serial number of the device.
 * @property {string?} userEmail - The email address of the user?.
 * @property {string?} groupId - The identifier for the group?.
 */
/**
 * @param eventType {string}
 * @param eventDetails {Object}
 * @param linkedEntities {LinkedEntities}
 * @param timestamp {number=}
 */
export const sendEvent = function(eventType, eventDetails, linkedEntities, timestamp) {
    return db.collection('statistics').insertOne({
        eventType: eventType,
        eventDetails: eventDetails,
        linkedEntities: linkedEntities,
        timestamp: timestamp
    })
}

// dbapi.getDevicesCount = function() {
export const getDevicesCount = function() {
    return db.devices.find().count()
}

// dbapi.getOfflineDevicesCount = function() {
export const getOfflineDevicesCount = function() {
    return db.devices.find(
        {
            present: false
        }
    ).count()
}

// dbapi.getOfflineDevices = function() {
export const getOfflineDevices = function() {
    return db.devices.find(
        {present: false},
        // @ts-ignore
        {_id: 0, 'provider.name': 1}
    ).toArray()
}

// dbapi.isPortExclusive = function(newPort) {
export const isPortExclusive = function(newPort) {
    return getAllocatedAdbPorts().then((ports) => {
        let result = !!ports.find(port => port === newPort)
        return !result
    })
}

// dbapi.getLastAdbPort = function() {
export const getLastAdbPort = function() {
    return getAllocatedAdbPorts().then((ports) => {
        if (ports.length === 0) {
            return 0
        }
        return Math.max(...ports)
    })
}

// dbapi.getAllocatedAdbPorts = function() {
export const getAllocatedAdbPorts = function() {
    // @ts-ignore
    return db.devices.find({}, {adbPort: 1, _id: 0}).toArray().then(ports => {
        let result = []
        ports.forEach((port) => {
            if (port.adbPort) {
                let portNum
                if (typeof port.adbPort === 'string') {
                    portNum = parseInt(port.adbPort.replace(/["']/g, ''), 10)
                }
                else {
                    portNum = port.adbPort
                }
                result.push(portNum)
            }
        })
        return result.sort((a, b) => a - b)
    })
}

// dbapi.initiallySetAdbPort = function(serial) {
export const initiallySetAdbPort = function(serial) {
    return getFreeAdbPort()
        .then((port) => port ? setAdbPort(serial, port) : null)
}

// dbapi.setAdbPort = function(serial, port) {
export const setAdbPort = function(serial, port) {
    return db.devices
        .updateOne({serial: serial}, {$set: {adbPort: port}})
        .then(() => port)
}

// dbapi.getAdbRange = function() {
export const getAdbRange = function() {
    return db.getRange()
}

// dbapi.getFreeAdbPort = function() {
export const getFreeAdbPort = function() {
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
}

// dbapi.generateIndexes = function() {
export const generateIndexes = function() {
    db.devices.createIndex({serial: -1}).then((result) => {
        log.info(`Created indexes with result - ${result}`)
    })
}

// dbapi.setDeviceSocketDisplay = function(data) {
export const setDeviceSocketDisplay = function(data) {
    return db.devices.updateOne(
        {serial: data.serial},
        {
            $set: {
                'display.density': 2,
                'display.fps': 60,
                'display.id': 0,
                'display.rotation': 0,
                'display.secure': true,
                'display.size': 4.971253395080566,
                'display.xdpi': 294.9670104980469,
                'display.ydpi': 295.56298828125,
                'display.width': data.width,
                'display.height': data.height
            }
        }
    ).then(() => {
        loadDeviceBySerial(data.serial)
    })
}

// dbapi.setDeviceSocketPorts = function(data, publicIp) {
export const setDeviceSocketPorts = function(data, publicIp) {
    return db.devices.updateOne(
        {serial: data.serial},
        {
            $set: {
                'display.url': `ws://${publicIp}:${data.screenPort}/`,
                'display.screenPort': data.screenPort,
                'display.connectPort': data.connectPort
            }
        }
    ).then(() => {
        loadDeviceBySerial(data.serial)
    })
}

// dbapi.updateIosDevice = function(message) {
export const updateIosDevice = function(message) {
    return db.devices.updateOne(
        {
            serial: message.id
        },
        {
            $set: {
                id: message.id,
                model: message.name,
                platform: message.platform,
                sdk: message.sdk,
                abi: message.architecture,
                version: message.sdk,
                service: message.options.service
            }
        }
    )
}

// dbapi.setDeviceIosVersion = function(message) {
export const setDeviceIosVersion = function(message) {
    const data = {
        version: message.sdkVersion
    }
    return db.devices.updateOne(
        {serial: message.id},
        {
            $set: data
        }
    )
}

// dbapi.sizeIosDevice = function(serial, height, width, scale) {
export const sizeIosDevice = function(serial, height, width, scale) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {
                'display.scale': scale,
                'display.height': height,
                'display.width': width
            }
        }
    )
}

// dbapi.getDeviceDisplaySize = function(serial) {
export const getDeviceDisplaySize = function(serial) {
    return db.devices.findOne({serial: serial})
        .then(result => {
            return result?.display
        })
}

// TODO Check usage. Probably dead code
export const setAbsentDisconnectedDevices = function() {
    return db.devices.updateOne(
        {
            platform: 'iOS'
        },
        {
            $set: {
                present: false,
                ready: false
            }
        }
    )
}

// dbapi.getInstalledApplications = function(message) {
export const getInstalledApplications = function(message) {
    return loadDeviceBySerial(message.serial)
}

// dbapi.setDeviceType = function(serial, type) {
export const setDeviceType = function(serial, type) {
    return db.devices.updateOne(
        {
            serial: serial
        },
        {
            $set: {
                deviceType: type
            }
        }
    )
}

// dbapi.getDeviceType = function(serial) {
export const getDeviceType = function(serial) {
    return db.devices.findOne({serial: serial})
        .then(result => {
            return result?.deviceType
        })
}

// dbapi.initializeIosDeviceState = function(publicIp, message) {
export const initializeIosDeviceState = function(publicIp, message) {
    const screenWsUrlPattern =
        message.provider.screenWsUrlPattern || `ws://${publicIp}:${message.ports.screenPort}/`

    const data = {
        present: true,
        presenceChangedAt: getNow(),
        provider: message.provider,
        owner: null,
        status: message.status,
        statusChangedAt: getNow(),
        ready: true,
        reverseForwards: [],
        remoteConnect: false,
        remoteConnectUrl: null,
        usage: null,
        display: {
            density: DEFAULT_IOS_DEVICE_ARGS.DENSITY,
            fps: DEFAULT_IOS_DEVICE_ARGS.FPS,
            id: DEFAULT_IOS_DEVICE_ARGS.ID,
            rotation: DEFAULT_IOS_DEVICE_ARGS.ROTATION,
            secure: DEFAULT_IOS_DEVICE_ARGS.SECURE,
            size: DEFAULT_IOS_DEVICE_ARGS.SIZE,
            xdpi: DEFAULT_IOS_DEVICE_ARGS.XDPI,
            ydpi: DEFAULT_IOS_DEVICE_ARGS.YDPI,
            url: screenWsUrlPattern
        },
        'group.owner.email': process.env.STF_ADMIN_EMAIL || 'administrator@fakedomain.com',
        'group.owner.name': process.env.STF_ADMIN_NAME || 'administrator',
        screenPort: message.ports.screenPort,
        connectPort: message.ports.connectPort,
        model: message.options.name,
        marketName: message.options.name,
        product: message.options.name,
        platform: message.options.platform,
        sdk: message.options.sdk,
        abi: message.options.architecture,
        manufacturer: 'Apple',
        service: message.options.service
    }

    return db.devices.updateOne({serial: message.serial},
        {
            $set: data
        }
    )
        // @ts-ignore
        .then(stats => {
            if (stats.modifiedCount === 0 && stats.matchedCount === 0) {
                return GroupModel.getRootGroup().then(function(group) {
                    data.serial = message.serial
                    data.createdAt = getNow()
                    data.group = {
                        id: group?.id,
                        name: group?.name,
                        lifeTime: group?.dates[0],
                        owner: group?.owner,
                        origin: group?.id,
                        class: group?.class,
                        repetitions: group?.repetitions,
                        originName: group?.name,
                        lock: false
                    }
                    return db.devices.insertOne(data)
                        .then(() => {
                            return GroupModel.addOriginGroupDevice(group, message.serial)
                        })
                })
            }
            return true
        })
        .then(() => {
            return db.devices.findOne({serial: message.serial})
        })
}

export const reserveUserGroupInstance = async(email) => {
    return db.users.updateMany(
        {email}
        , [{
            $set: {'groups.quotas.consumed.number': {
                $min: [{
                    $sum: ['$groups.quotas.consumed.number', 1]
                }, '$groups.quotas.allocated.number']}
            }
        }]
    )
}

export const releaseUserGroupInstance = async(email) => {
    return db.users.updateMany(
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
}

export const updateUserGroupDuration = async(email, oldDuration, newDuration) => {
    return db.users.updateOne(
        {email: email}
        , [{
            $set: {
                'groups.quotas.consumed.duration': {
                    $cond: [
                        {$lte: [{$sum: ['$groups.quotas.consumed.duration', newDuration, -oldDuration]}, '$groups.quotas.allocated.duration']},
                        {$sum: ['$groups.quotas.consumed.duration', newDuration, -oldDuration]},
                        '$groups.quotas.consumed.duration'
                    ]
                }
            }
        }]
    )
}

export const updateUserGroupsQuotas = async(email, duration, number, repetitions) => {
    const oldDoc = await db.users.findOne({email: email})

    const consumed = oldDoc?.groups.quotas.consumed.duration
    const allocated = oldDoc?.groups.quotas.allocated.duration
    const consumedNumber = oldDoc?.groups.quotas.consumed.number
    const allocatedNumber = oldDoc?.groups.quotas.allocated.number

    const updateStats = await db.users.updateOne(
        {email: email}
        , {
            $set: {
                'groups.quotas.allocated.duration': duration && consumed <= duration &&
                (!number || consumedNumber <= number) ? duration : allocated,
                'groups.quotas.allocated.number': number && consumedNumber <= number &&
                (!duration || consumed <= duration) ? number : allocatedNumber,
                'groups.quotas.repetitions': repetitions || oldDoc?.groups.quotas.repetitions
            }
        }
    )

    const newDoc = await db.users.findOne({email: email})
    // @ts-ignore
    updateStats.changes = [
        {new_val: {...newDoc}, old_val: {...oldDoc}}
    ]

    return updateStats
}

export const updateDefaultUserGroupsQuotas = async(email, duration, number, repetitions) => {
    const updateStats = await db.users.updateOne(
        {email: email}
        , [{
            $set: {
                'groups.quotas.defaultGroupsDuration': {
                    $cond: [
                        {
                            $ne: [duration, null]
                        },
                        duration,
                        '$groups.quotas.defaultGroupsDuration'
                    ]
                },
                'groups.quotas.defaultGroupsNumber': {
                    $cond: [
                        {
                            $ne: [number, null]
                        },
                        number,
                        '$groups.quotas.defaultGroupsNumber'
                    ]
                },
                'groups.quotas.defaultGroupsRepetitions': {
                    $cond: [
                        {
                            $ne: [repetitions, null]
                        },
                        repetitions,
                        '$groups.quotas.defaultGroupsRepetitions'
                    ]
                }
            }
        }]
    )

    const newDoc = await db.users.findOne({email: email})
    // @ts-ignore
    updateStats.changes = [
        {new_val: {...newDoc}}
    ]

    return updateStats
}

export const updateDeviceGroupName = async(serial, group) => {
    return db.devices.updateOne(
        {serial: serial}
        , [{
            $set: {
                'group.name': {
                    $cond: [
                        {
                            $eq: [apiutil.isOriginGroup(group?.class), false]
                        },
                        {
                            $cond: [
                                {
                                    $eq: [group?.isActive, true]
                                },
                                group?.name,
                                '$group?.name'
                            ]
                        },
                        {
                            $cond: [
                                {
                                    $eq: ['$group?.origin', '$group?.id']
                                },
                                group?.name,
                                '$group?.name'
                            ]
                        }
                    ]
                },
                'group.originName': {
                    $cond: [
                        {
                            $eq: [apiutil.isOriginGroup(group?.class), true]
                        },
                        group?.name,
                        '$group?.originName'
                    ]
                }
            }
        }]
    )
}

export const updateDevicesCurrentGroupFromOrigin = (serials) => {
    return Promise.all((Array.isArray(serials) ? serials : [serials]).map(async(serial) => {
        const device = await db.devices.findOne({serial: serial})
        const group = (
            await getGroup(device?.group?.origin) ||
            await getRootGroup()
        )

        return updateDeviceCurrentGroup(serial, group)
    }))
}

export const updateDeviceCurrentGroup = async(serial, group) => {
    return db.devices.updateOne(
        {serial},
        {
            $set: {
                'group.id': group?.id,
                'group.name': group?.name,
                'group.owner': group?.owner,
                'group.lifeTime': group?.dates[0],
                'group.class': group?.class,
                'group.repetitions': group?.repetitions,
                'group.runUrl': group?.runUrl
            }
        }
    )
}

export const updateDevicesCurrentGroup = async(serials, group) => {
    return db.devices.updateMany(
        {serial: {$in: serials}},
        {
            $set: {
                'group.id': group?.id,
                'group.name': group?.name,
                'group.owner': group?.owner,
                'group.lifeTime': group?.dates[0],
                'group.class': group?.class,
                'group.repetitions': group?.repetitions,
                'group.runUrl': group?.runUrl
            }
        }
    )
}

export const updateDevicesOriginGroup = async(serial, group) => {
    const update = {
        $set: {
            'group.origin': group.id,
            'group.originName': group.name
        }
    }

    const stats = await (
        Array.isArray(serial) ?
            db.devices.updateMany({serial: {$in: serial}}, update) :
            db.devices.updateOne({serial}, update)
    )

    if (stats.modifiedCount) {
        log.info(
            '[updateDevicesOriginGroup] Successfully updated origin group in device [serial: "%s", group: "%s", name: "%s"]',
            serial,
            group.id,
            group.name
        )
        return true
    }

    log.error(
        '[updateDevicesOriginGroup] Device not found [serial: "%s", group: "%s", name: "%s", stats: %s]',
        serial,
        group.id,
        group.name,
        JSON.stringify(stats, null, 2)
    )
    return false
}

export const returnDevicesToRoot = async(serial) => {
    const root = await getRootGroup()
    const update = {
        $set: {
            'group.id': root?.id,
            'group.name': root?.name,
            'group.owner': root?.owner,
            'group.lifeTime': root?.dates[0],
            'group.class': root?.class,
            'group.repetitions': root?.repetitions,
            'group.runUrl': root?.runUrl,
            'group.origin': root?.id,
            'group.originName': root?.name
        }
    }
    return Array.isArray(serial) ?
        db.devices.updateMany({serial: {$in: serial}}, update) :
        db.devices.updateOne({serial}, update)
}
