/* *
 * Copyright 2025 contains code contributed by V Kontakte LLC - Licensed under the Apache license 2.0
 * */

import util from 'util'
import db from '../../index.js'
import wireutil from '../../../wire/util.js'
import {v4 as uuidv4} from 'uuid'
import * as apiutil from '../../../util/apiutil.js'
import GroupModel from '../group/index.js'
import UserModel from '../user/index.js'
import DeviceModel from '../device/index.js'
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
        db.groups.updateMany(
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
        return UserModel.getUsers().then(function(users) {
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
            return UserModel.saveUserAfterLogin({
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
                    return UserModel.reserveUserGroupInstance(group?.owner?.email)
                })
        })
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

// dbapi.lockUser = function(email) {
export const lockUser = function(email) {
    function wrappedlockUser() {
        return UserModel.setLockOnUser(email, true)
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
    return UserModel.setLockOnUser(email, false)
}

// dbapi.isDeviceBooked = function(serial) {
export const isDeviceBooked = function(serial) {
    return GroupModel.getDeviceTransientGroups(serial)
        .then(groups => !!groups?.length)
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

export const saveIosDeviceInitialState = function(publicIp, message) {
    const data = {
        present: true,
        presenceChangedAt: getNow(),
        provider: message.provider,
        owner: null,
        status: message.status,
        statusChangedAt: getNow(),
        ready: false,
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
            url: message.provider.screenWsUrlPattern
        },
        'group.owner.email': process.env.STF_ADMIN_EMAIL || 'administrator@fakedomain.com',
        'group.owner.name': process.env.STF_ADMIN_NAME || 'administrator',
        manufacturer: 'Apple'
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
        ready: false,
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
                usage: null,
                logs_enabled: false,
                present: false,
                presenceChangedAt: getNow()
            }
        }
    )
}

// dbapi.setDeviceUsage = function(serial, usage) {
export const setDeviceState = function(serial, {usage, owner, timeout}) {
    const usageSet = typeof usage === 'undefined' ? {} : {
        usage, usageChangedAt: getNow(),
        ... !usage && {logs_enabled: false}
    }

    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {
                owner,
                ...usageSet,
                ... typeof timeout === 'number' && {
                    statusChangedAt: getNow(),
                    bookedBefore: timeout
                },
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

// dbapi.isPortExclusive = function(newPort) {
export const isPortExclusive = function(newPort) {
    return DeviceModel.getAllocatedAdbPorts().then((ports) => {
        let result = !!ports.find(port => port === newPort)
        return !result
    })
}

// dbapi.getLastAdbPort = function() {
export const getLastAdbPort = function() {
    return DeviceModel.getAllocatedAdbPorts().then((ports) => {
        if (ports.length === 0) {
            return 0
        }
        return Math.max(...ports)
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
                marketName: message.marketName,
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

// dbapi.sizeIosDevice = function(serial, height, width, scale, url) {
export const sizeIosDevice = function(serial, height, width, scale, url) {
    return db.devices.updateOne(
        {serial: serial},
        {
            $set: {
                'display.scale': scale,
                'display.height': height,
                'display.width': width,
                'display.url': url
            }
        }
    )
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
    return DeviceModel.loadDeviceBySerial(message.serial)
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

// dbapi.initializeIosDeviceState = function(publicIp, message) {
export const initializeIosDeviceState = function(publicIp, message) {
    const data = {
        present: true,
        presenceChangedAt: getNow(),
        owner: null,
        status: message.status,
        statusChangedAt: getNow(),
        ready: true,
        reverseForwards: [],
        remoteConnect: false,
        remoteConnectUrl: null,
        usage: null,
        'group.owner.email': process.env.STF_ADMIN_EMAIL || 'administrator@fakedomain.com',
        'group.owner.name': process.env.STF_ADMIN_NAME || 'administrator',
        screenPort: message.ports.screenPort,
        connectPort: message.ports.connectPort,
        model: message.options.name,
        marketName: message.options.marketName,
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

    if (stats.modifiedCount || stats.matchedCount) {
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
