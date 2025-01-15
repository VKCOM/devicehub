/**
 * Copyright © 2024 contains code contributed by V Kontakte LLC, authors: Daniil Smirnov, Egor Platonov, Aleksey Chistov - Licensed under the Apache license 2.0
 **/

import _ from 'lodash'
import * as dbapi from '../../../db/api.js'
import * as apiutil from '../../../util/apiutil.js'
import logger from '../../../util/logger.js'
import * as lockutil from '../../../util/lockutil.js'
import util from 'util'
import {v4 as uuidv4} from 'uuid'
import Promise from 'bluebird'
import usersapi from './users.js'
const log = logger.createLogger('groups-controller:')

/* ---------------------------------- PRIVATE FUNCTIONS --------------------------------- */
function groupApiWrapper(email, fn, req, res) {
    dbapi.loadUser(email).then(function(user) {
        if (!user) {
            apiutil.respond(res, 404, 'Not Found (user)')
        }
        else {
            req.user = user
            fn(req, res)
        }
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to wrap "%s": ', fn.name, err.stack)
        })
}
function getDevice(req, serial) {
    return dbapi.loadDeviceBySerial(serial, req.query.fields).then(function(device) {
        if (!device) {
            throw new Error(`Device not found: ${serial}`)
        }
        return apiutil.filterDevice(req, device)
    })
}
function checkConflicts(id, devices, dates) {
    function computeConflicts(conflicts, liteGroup, otherGroup) {
        if (otherGroup.id !== liteGroup.id) {
            const devices = _.intersection(liteGroup.devices, otherGroup.devices)
            if (devices.length) {
                for (let liteGroupDate of liteGroup.dates) {
                    for (let otherGroupDate of otherGroup.dates) {
                        if (liteGroupDate.start < otherGroupDate.stop &&
                            liteGroupDate.stop > otherGroupDate.start) {
                            conflicts.push({
                                devices: devices
                                , date: {
                                    start: new Date(Math.max(liteGroupDate.start.getTime(), otherGroupDate.start.getTime()))
                                    , stop: new Date(Math.min(liteGroupDate.stop.getTime(), otherGroupDate.stop.getTime()))
                                }
                                , group: otherGroup.name
                                , owner: otherGroup.owner
                            })
                        }
                    }
                }
            }
        }
    }
    return dbapi.getTransientGroups().then(function(groups) {
        const conflicts = []
        groups.forEach(function(otherGroup) {
            computeConflicts(conflicts, {id: id, devices: devices, dates: dates}, otherGroup)
        })
        return conflicts
    })
}
function checkSchedule(res, oldGroup, _class, email, repetitions, privilege, start, stop) {
    if (oldGroup && oldGroup.devices.length &&
        (apiutil.isOriginGroup(_class) && !apiutil.isOriginGroup(oldGroup.class) ||
            apiutil.isOriginGroup(oldGroup.class) && !apiutil.isOriginGroup(_class))) {
        return Promise.resolve(apiutil.respond(res, 403, 'Forbidden (unauthorized class while device list is not empty)'))
    }
    if (apiutil.isAdminGroup(_class) && privilege === apiutil.USER) {
        return Promise.resolve(apiutil.respond(res, 403, 'Forbidden (unauthorized class)'))
    }
    if (isNaN(start.getTime())) {
        return Promise.resolve(apiutil.respond(res, 400, 'Bad Request (Invalid startTime format)'))
    }
    if (isNaN(stop.getTime())) {
        return Promise.resolve(apiutil.respond(res, 400, 'Bad Request (Invalid stopTime format)'))
    }
    if (start >= stop) {
        return Promise.resolve(apiutil.respond(res, 400, 'Bad Request (Invalid life time: startTime >= stopTime)'))
    }
    if ((stop - start) > apiutil.CLASS_DURATION[_class]) {
        return Promise.resolve(apiutil.respond(res, 400, 'Bad Request (Invalid Life time & class combination: life time > class duration)'))
    }
    switch (_class) {
    case apiutil.BOOKABLE:
    case apiutil.STANDARD:
    case apiutil.ONCE:
        if (repetitions !== 0) {
            return Promise.resolve(apiutil.respond(res, 400, 'Bad Request (Invalid class & repetitions combination)'))
        }
        break
    default:
        if (repetitions === 0) {
            return Promise.resolve(apiutil.respond(res, 400, 'Bad Request (Invalid class & repetitions combination)'))
        }
        break
    }
    return dbapi.loadUser(email).then(function(owner) {
        if (repetitions > owner.groups.quotas.repetitions) {
            return apiutil.respond(res, 400, 'Bad Request (Invalid repetitions value)')
        }
        return true
    })
}

/* ---------------------------------- PUBLIC FUNCTIONS ------------------------------------- */
function addGroupDevices(req, res) {
    const serials = apiutil.getBodyParameter(req.body, 'serials')
    const target = apiutil.getQueryParameter(req.query.redirected) ? 'device' : 'devices'
    let amount = apiutil.getBodyParameter(req.body, 'amount') // todo: QA-9976
    if (amount) {
        amount = Number(amount)
    }
    let needAmount = apiutil.getBodyParameter(req.body, 'needAmount')
    if (needAmount) {
        if (typeof needAmount === 'string') {
            needAmount = needAmount === 'true'
        }
    }
    else {
        needAmount = false
    }
    let isInternal = apiutil.getBodyParameter(req.body, 'isInternal')
    if (isInternal) {
        if (typeof isInternal === 'string') {
            isInternal = isInternal === 'true'
        }
    }
    else {
        isInternal = false
    }
    const abi = apiutil.getBodyParameter(req.body, 'abi')
    const model = apiutil.getBodyParameter(req.body, 'model')
    const version = apiutil.getBodyParameter(req.body, 'version')
    const sdk = apiutil.getBodyParameter(req.body, 'sdk')
    const type = apiutil.getBodyParameter(req.body, 'type')
    const lock = {}
    let email = null
    function _addGroupDevices(lockedGroup, serials) {
        let group = lockedGroup
        return dbapi.addGroupDevices(group, serials)
            .then(autotestsGroup => {
                if (isInternal) {
                    dbapi.loadDevicesBySerials(autotestsGroup.devices)
                        .then(devices => apiutil.respond(res, 200, `Added (group ${target})`, {group: {id: autotestsGroup.id, devices: devices}}))
                }
                else {
                    apiutil.respond(res, 200, `Added (group ${target})`, {group: apiutil.publishGroup(autotestsGroup)})
                }
            })
            .catch(function(err) {
                log.error(err)
                if (err === 'quota is reached') {
                    apiutil.respond(res, 403, 'Forbidden (groups duration quota is reached)')
                    let request = {
                        body: {
                            ids: group.id
                        }
                        , user: req.user
                        , query: {
                            redirected: true
                        }
                        , options: req.options
                    }
                    deleteGroups(request, res)
                }
                else if (Array.isArray(err)) {
                    apiutil.respond(res, 409, 'Conflicts Information', {conflicts: err})
                    let request = {
                        body: {
                            ids: group.id
                        }
                        , user: req.user
                        , query: {
                            redirected: true
                        }
                        , options: req.options
                    }
                    deleteGroups(request, res)
                }
                else if (err !== 'busy') {
                    throw err
                }
            })
    }
    lockutil.lockGroup(req, res, lock).then(function(lockingSuccessed) {
        if (lockingSuccessed) {
            let group = lock.group
            if (req.user.privilege === apiutil.ADMIN && req.user.email !== group.owner.email) {
                email = group.owner.email
                return false
            }
            if (apiutil.isOriginGroup(group.class)) {
                return apiutil.respond(res, 400, 'Bad Request (use admin API for bookable/standard groups)')
            }
            return (function() {
                if (typeof serials === 'undefined' && typeof amount === 'undefined') {
                    return dbapi.loadBookableDevices(req.user.groups.subscribed, req.query.fields).then(function(devices) {
                        const serials = []
                        devices.forEach(function(device) {
                            if (group.devices.indexOf(device.serial) < 0) {
                                serials.push(device.serial)
                            }
                        })
                        return _addGroupDevices(group, serials)
                    })
                }
                if (serials) {
                    return _addGroupDevices(group, _.difference(_.without(serials.split(','), ''), group.devices))
                }
                if (amount) {
                    return dbapi.loadBookableDevicesWithFiltersLock(req.user.groups.subscribed, abi, model, type, sdk, version, function(devices) {
                        let serials = []
                        if (devices) {
                            serials = devices.map(device => device.serial)
                        }
                        if ((serials.length > 0 && !needAmount) || (needAmount && serials.length === amount)) {
                            return _addGroupDevices(group, serials)
                        }
                        else {
                            apiutil.respond(res, 409, 'Cant create group. Not enough free devices')
                            let request = {
                                body: {
                                    ids: group.id
                                }
                                , user: req.user
                                , query: {
                                    redirected: true
                                }
                                , options: req.options
                            }
                            deleteGroups(request, res)
                        }
                    }, amount)
                }
            })()
        }
        return false
    })
        .catch(function(err) {
            apiutil.internalError(res, `Failed to add group ${target}: `, err.stack)
        })
        .finally(function() {
            lockutil.unlockGroup(lock)
            if (email) {
                groupApiWrapper(email, addGroupDevices, req, res)
            }
        })
}
function addGroupDevice(req, res) {
    apiutil.redirectApiWrapper('serial', addGroupDevices, req, res)
}
function removeGroupDevices(req, res) {
    const serials = apiutil.getBodyParameter(req.body, 'serials')
    const target = apiutil.getQueryParameter(req.query.redirected) ? 'device' : 'devices'
    const isInternal = req.isInternal
    const lock = {}
    lockutil.lockGroup(req, res, lock).then(function(lockingSuccessed) {
        if (lockingSuccessed) {
            const group = lock.group
            if (apiutil.isOriginGroup(group.class)) {
                return apiutil.respond(res, 400, 'Bad Request (use admin API for bookable/standard groups)')
            }
            let serialsToRemove = group.devices
            if (typeof serials !== 'undefined') {
                serialsToRemove = _.without(serials.split(','), '')
            }
            if (!serialsToRemove.length) {
                return apiutil.respond(res, 200, `Unchanged (group ${target})`, {group: {}})
            }
            serialsToRemove = _.intersection(serialsToRemove, group.devices)
            if (!serialsToRemove.length) {
                return apiutil.respond(res, 404, `Not Found (group ${target})`)
            }
            return dbapi.removeGroupDevices(group, serialsToRemove).then(function(group) {
                if (group.class === apiutil.ONCE) {
                    dbapi.returnDevicesToOriginGroup(serialsToRemove).then(() => {
                        if (isInternal) {
                            return true
                        }
                        else {
                            apiutil.respond(res, 200, `Removed (group ${target})`, {group: apiutil.publishGroup(group)})
                        }
                    })
                }
                else {
                    apiutil.respond(res, 200, `Removed (group ${target})`, {group: apiutil.publishGroup(group)})
                }
            })
        }
        return false
    })
        .catch(function(err) {
            apiutil.internalError(res, `Failed to remove group ${target}: `, err.stack)
        })
        .finally(function() {
            lockutil.unlockGroup(lock)
        })
}
function removeGroupDevice(req, res) {
    apiutil.redirectApiWrapper('serial', removeGroupDevices, req, res)
}
function getGroupDevice(req, res) {
    const id = req.params.id
    const serial = req.params.serial
    dbapi.getUserGroup(req.user.email, id).then(function(group) {
        if (!group) {
            apiutil.respond(res, 404, 'Not Found (group)')
        }
        else if (group.devices.indexOf(serial) < 0) {
            apiutil.respond(res, 404, 'Not Found (device)')
        }
        else {
            getDevice(req, serial).then(function(device) {
                apiutil.respond(res, 200, 'Device Information', {device: device})
            })
        }
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to get group device: ', err.stack)
        })
}
function getGroupUser(req, res) {
    const id = req.params.id
    const email = req.params.email
    dbapi.getUserGroup(req.user.email, id).then(function(group) {
        if (!group) {
            apiutil.respond(res, 404, 'Not Found (group)')
        }
        else if (group.users.indexOf(email) < 0) {
            apiutil.respond(res, 404, 'Not Found (user)')
        }
        else {
            usersapi.getUserByEmail(req, res)
        }
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to get group user: ', err.stack)
        })
}
function getGroupUsers(req, res) {
    const id = req.params.id
    dbapi.getUserGroup(req.user.email, id).then(function(group) {
        if (!group) {
            apiutil.respond(res, 404, 'Not Found (group)')
        }
        else {
            Promise.map(group.users, function(email) {
                return usersapi.getUserInfo(req, email).then(function(user) {
                    return user || Promise.reject(`Group user not found: ${email}`)
                })
            })
                .then(function(users) {
                    apiutil.respond(res, 200, 'Users Information', {users: users})
                })
        }
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to get group users: ', err.stack)
        })
}
function removeGroupUsers(req, res) {
    const id = req.params.id
    const emails = apiutil.getBodyParameter(req.body, 'emails')
    const target = apiutil.getQueryParameter(req.query.redirected) ? 'user' : 'users'
    const lock = {}
    function removeGroupUser(email, group, rootGroup) {
        if (group.users.indexOf(email) < 0) {
            return Promise.resolve('not found')
        }
        if (email === rootGroup.owner.email || email === group.owner.email) {
            return Promise.resolve('forbidden')
        }
        const lock = {}
        return dbapi.lockUser(email).then(function(stats) {
            if (stats.modifiedCount === 0) {
                return apiutil.lightComputeStats(res, stats)
            }
            lock.user = stats.changes[0].new_val
            return dbapi.isRemoveGroupUserAllowed(email, group)
                .then(function(isAllowed) {
                    return isAllowed ? dbapi.removeGroupUser(id, email) : 'forbidden'
                })
        })
            .finally(function() {
                lockutil.unlockUser(lock)
            })
    }
    lockutil.lockGroup(req, res, lock).then(function(lockingSuccessed) {
        if (lockingSuccessed) {
            const group = lock.group
            return dbapi.getRootGroup().then(function(rootGroup) {
                let emailsToRemove = group.users
                let results = []
                if (typeof emails !== 'undefined') {
                    emailsToRemove = _.without(emails.split(','), '')
                }
                return Promise.each(emailsToRemove, function(email) {
                    return removeGroupUser(email, group, rootGroup).then(function(result) {
                        results.push(result)
                    })
                })
                    .then(function() {
                        if (!results.length) {
                            return apiutil.respond(res, 200, `Unchanged (group ${target})`, {group: {}})
                        }
                        results = _.without(results, 'not found')
                        if (!results.length) {
                            return apiutil.respond(res, 404, `Not Found (group ${target})`)
                        }
                        if (!_.without(results, 'forbidden').length) {
                            return apiutil.respond(res, 403, `Forbidden (group ${target})`)
                        }
                        return dbapi.getGroup(id).then(function(group) {
                            apiutil.respond(res, 200, `Removed (group ${target})`, {
                                group: apiutil.publishGroup(group)
                            })
                        })
                    })
            })
                .catch(function(err) {
                    if (err !== 'busy') {
                        throw err
                    }
                })
        }
        return false
    })
        .catch(function(err) {
            apiutil.internalError(res, `Failed to remove group ${target}: `, err.stack)
        })
        .finally(function() {
            lockutil.unlockGroup(lock)
        })
}
function removeGroupUser(req, res) {
    apiutil.redirectApiWrapper('email', removeGroupUsers, req, res)
}
function addGroupUsers(req, res) {
    const id = req.params.id
    const emails = apiutil.getBodyParameter(req.body, 'emails')
    const target = apiutil.getQueryParameter(req.query.redirected) ? 'user' : 'users'
    const lock = {}
    function addGroupUser(email) {
        const lock = {}
        return dbapi.lockUser(email)
            .then(function(stats) {
                if (stats.modifiedCount === 0) {
                    return apiutil.lightComputeStats(res, stats)
                }
                lock.user = stats.changes[0].new_val
                return dbapi.addGroupUser(id, email)
            })
            .catch((e) => {
                if (e instanceof TypeError) {
                    log.error('User with email ' + email + " doesn't exist")
                    return 'User with email ' + email + " doesn't exist"
                }
                else {
                    throw Error
                }
            })
            .finally(function() {
                lockutil.unlockUser(lock)
            })
    }
    function _addGroupUsers(emails) {
        let results = []
        return Promise.each(emails, function(email) {
            return addGroupUser(email).then(function(result) {
                results.push(result)
            })
        })
            .then(function() {
                if (!_.without(results, 'unchanged').length) {
                    return apiutil.respond(res, 200, `Unchanged (group ${target})`, {group: {}})
                }
                if (!_.without(results, 'not found').length) {
                    return apiutil.respond(res, 404, `Not Found (group ${target})`)
                }
                if (_.findIndex(results, str => str.includes("doesn't exist")) !== -1) {
                    return dbapi.getGroup(id).then(function(group) {
                        return apiutil.respond(res, 207, `Not all of users added (group ${target})`,
                            {
                                info: results
                                , group: apiutil.publishGroup(group)
                            })
                    })
                }
                return dbapi.getGroup(id).then(function(group) {
                    apiutil.respond(res, 200, `Added (group ${target})`, {group: apiutil.publishGroup(group)})
                })
            })
            .catch(function(err) {
                if (err !== 'busy') {
                    throw err
                }
            })
    }
    lockutil.lockGroup(req, res, lock).then(function(lockingSuccessed) {
        if (!lockingSuccessed) {
            return false
        }
        const group = lock.group
        return (function() {
            if (typeof emails === 'undefined') {
                return dbapi.getUsers().then(function(users) {
                    const emails = []
                    users.forEach(function(user) {
                        if (group.users.indexOf(user.email) < 0) {
                            emails.push(user.email)
                        }
                    })
                    return _addGroupUsers(emails)
                })
            }
            else {
                return _addGroupUsers(_.difference(_.without(emails.split(','), ''), group.users))
            }
        })()
    })
        .catch(function(err) {
            apiutil.internalError(res, `Failed to add group ${target}: `, err.stack)
        })
        .finally(function() {
            lockutil.unlockGroup(lock)
        })
}
function addGroupUser(req, res) {
    apiutil.redirectApiWrapper('email', addGroupUsers, req, res)
}
function getGroup(req, res) {
    const id = req.params.id
    const fields = req.query.fields
    dbapi.getUserGroup(req.user.email, id).then(function(group) {
        if (!group) {
            apiutil.respond(res, 404, 'Not Found (group)')
            return
        }
        let publishedGroup = apiutil.publishGroup(group)
        if (fields) {
            publishedGroup = _.pick(publishedGroup, fields.split(','))
        }
        apiutil.respond(res, 200, 'Group Information', {group: publishedGroup})
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to get group: ', err.stack)
        })
}
function getGroups(req, res) {
    const fields = req.query.fields
    const owner = req.query.owner
    let getGenericGroups
    switch (owner) {
    case true:
        getGenericGroups = dbapi.getOwnerGroups
        break
    case false:
        getGenericGroups = dbapi.getOnlyUserGroups
        break
    default:
        getGenericGroups = dbapi.getUserGroups
    }
    getGenericGroups(req.user.email).then(function(groups) {
        return apiutil.respond(res, 200, 'Groups Information', {
            groups: groups.map(function(group) {
                if (fields) {
                    return _.pick(apiutil.publishGroup(group), fields.split(','))
                }
                return apiutil.publishGroup(group)
            })
        })
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to get groups: ', err.stack)
        })
}

function createGroupFunc(
    res,
    _class,
    email,
    repetitions,
    name,
    username,
    privilege,
    isActive,
    dates,
    start,
    stop,
    duration,
    state,
    runUrl
) {
    checkSchedule(res, null, _class, email, repetitions, privilege,
        start, stop)
        .then(function(checkingSuccessed) {
            if (!checkingSuccessed) {
                log.info('Schedule check fail')
                return
            }
        })

    return dbapi.createUserGroup({
        name: name
        , owner: {
            email: email
            , name: username
        }
        , privilege: privilege
        , class: _class
        , repetitions: repetitions
        , isActive: isActive
        , dates: dates
        , duration: duration
        , state: state
    })
}
function createGroup(req, res) {
    const _class = typeof req.body.class === 'undefined' ? apiutil.ONCE : req.body.class
    const repetitions = apiutil.isOriginGroup(_class) || typeof req.body.repetitions === 'undefined' ?
        0 :
        req.body.repetitions
    const now = Date.now()
    const start = apiutil.isOriginGroup(_class) ?
        new Date(now) :
        new Date(req.body.startTime || now)
    const stop = apiutil.isOriginGroup(_class) ?
        new Date(now + apiutil.ONE_YEAR) :
        new Date(req.body.stopTime || now + apiutil.ONE_HOUR)
    const email = req.user.email
    const privilege = req.user.privilege
    const username = req.user.name
    let state = req.body.state
    const name = typeof req.body.name === 'undefined' ?
        'New_' + util.format('%s', uuidv4()).replace(/-/g, '') :
        req.body.name
    state =
        apiutil.isOriginGroup(_class) || typeof state === 'undefined' ?
            apiutil.READY :
            state
    const isActive = state === apiutil.READY && apiutil.isOriginGroup(_class)
    const duration = 0
    const dates = apiutil.computeGroupDates({start: start, stop: stop}, _class, repetitions)
    createGroupFunc(res, _class, email, repetitions, name, username, privilege, isActive, dates, start, stop, duration, state).then(function(group) {
        if (group) {
            apiutil.respond(res, 201, 'Created', {group: apiutil.publishGroup(group)})
        }
        else {
            apiutil.respond(res, 403, 'Forbidden (groups number quota is reached)')
        }
    }).catch(function(err) {
        apiutil.internalError(res, 'Failed to create group: ', err.stack)
    })
}
function deleteGroups(req, res) {
    const ids = apiutil.getBodyParameter(req.body, 'ids')
    const target = apiutil.getQueryParameter(req.query.redirected) ? 'group' : 'groups'
    function removeGroup(id) {
        function unsetDevices(serials) {
            Promise.map(serials, function(serial) {
                let unsetReq = {
                    isInternal: true
                    , serial: serial
                    , user: req.user
                    , params: {email: req.user.email}
                    , options: req.options
                }
                usersapi.deleteUserDeviceBySerial(unsetReq, res)
                usersapi.remoteDisconnectUserDevice(unsetReq, res)
            })
        }
        const lock = {}
        return dbapi.lockGroupByOwner(req.user.email, id).then(function(stats) {
            log.info('Stats: ' + JSON.stringify(stats))
            if (stats.modifiedCount === 0) {
                return apiutil.lightComputeStats(res, stats)
            }
            lock.group = stats.changes[0].new_val
            const group = lock.group
            if (group.privilege === apiutil.ROOT) {
                return 'forbidden'
            }
            if (group.class === apiutil.BOOKABLE) {
                return Promise.each(group.devices, function(serial) {
                    return dbapi.isDeviceBooked(serial)
                        .then(function(isBooked) {
                            return isBooked ? Promise.reject('booked') : true
                        })
                })
                    .then(function() {
                        return dbapi.deleteUserGroup(id).then(deleteResult => {
                            unsetDevices(group.devices)
                            return deleteResult
                        })
                    })
                    .catch(function(err) {
                        if (err !== 'booked') {
                            throw err
                        }
                        return 'forbidden'
                    })
            }
            return dbapi.deleteUserGroup(id).then(deleteResult => {
                unsetDevices(group.devices)
                return deleteResult
            })
        })
            .finally(function() {
                lockutil.unlockGroup(lock)
            })
    }
    function removeGroups(ids) {
        let results = []
        return Promise.each(ids, function(id) {
            return removeGroup(id).then(function(result) {
                log.info('Remove group result: ' + result)
                results.push(result)
            })
        })
            .then(function() {
                if (!results.length) {
                    return apiutil.respond(res, 304, `Unchanged (${target})`)
                }
                results = _.without(results, 'not found')
                if (!results.length) { // if everything is "not found"
                    return apiutil.respond(res, 404, `Not Found (${target})`)
                }
                results = _.without(results, 'forbidden')
                if (!results.length) { // if everything is forbidden
                    return apiutil.respond(res, 403, `Forbidden (${target})`)
                }
                return apiutil.respond(res, 200, `Deleted (${target})`)
            })
            .catch(function(err) {
                if (err !== 'busy') {
                    throw err
                }
            })
    }
    (function() {
        if (typeof ids === 'undefined') {
            return dbapi.getOwnerGroups(req.user.email).then(function(groups) {
                const ids = []
                groups.forEach(function(group) {
                    if (group.privilege !== apiutil.ROOT) {
                        ids.push(group.id)
                    }
                })
                return removeGroups(ids)
            })
        }
        else {
            return removeGroups(_.without(ids.split(','), ''))
        }
    })()
        .catch(function(err) {
            apiutil.internalError(res, `Failed to delete ${target}: `, err.stack)
        })
}
function deleteGroup(req, res) {
    apiutil.redirectApiWrapper('id', deleteGroups, req, res)
}
function updateGroup(req, res) {
    const id = req.params.id
    const lock = {}
    const isInternal = req.isInternal
    function updateUserGroup(group, data) {
        return dbapi.updateUserGroup(group, data)
            .then(function(group) {
                if (group) {
                    if (isInternal) {
                        dbapi.loadDevicesBySerials(group.devices)
                            .then(devices => apiutil.respond(res, 200, 'Updated (group)', {group: {id: group.id, devices: devices}}))
                    }
                    else {
                        apiutil.respond(res, 200, 'Updated (group)', {group: apiutil.publishGroup(group)})
                    }
                }
                else {
                    apiutil.respond(res, 403, 'Forbidden (groups duration quota is reached)')
                }
            })
    }
    lockutil.lockGroup(req, res, lock).then(function(lockingSuccessed) {
        if (!lockingSuccessed) {
            return false
        }
        const group = lock.group
        const _class = typeof req.body.class === 'undefined' ? group.class : req.body.class
        const name = typeof req.body.name === 'undefined' ? group.name : req.body.name
        const repetitions = typeof req.body.repetitions === 'undefined' ?
            group.repetitions :
            req.body.repetitions
        const start = new Date(req.body.startTime || group.dates[0].start)
        const stop = new Date(req.body.stopTime || group.dates[0].stop)
        let state, isActive

        if (group.state !== apiutil.PENDING) {
            // only name can be updated
            state = typeof req.body.state === 'undefined' ? group.state : req.body.state

            if (start.toISOString() !== group.dates[0].start.toISOString() ||
                  stop.toISOString() !== group.dates[0].stop.toISOString() ||
                  state !== group.state ||
                  _class !== group.class ||
                  repetitions !== group.repetitions) {
                return apiutil.respond(res, 403, 'Forbidden (only name can be updated)')
            }

            if (name === group.name) {
                return apiutil.respond(res, 200, 'Unchanged (group)', {group: {}})
            }

            return dbapi.updateGroup(group.id, {
                name: name
            })
                .then(function(updatedGroup) {
                    if (updatedGroup) {
                        apiutil.respond(res, 200, 'Updated (group)', {group: apiutil.publishGroup(updatedGroup)})
                    }
                    else {
                        throw new Error(`Group not found: ${group.id}`)
                    }
                })
        }
        if (apiutil.isOriginGroup(_class)) {
            state = apiutil.READY
            isActive = true
        }
        else {
            state = typeof req.body.state === 'undefined' ? apiutil.PENDING : req.body.state
            isActive = false
        }
        if (group.state === apiutil.READY && state === apiutil.PENDING) {
            return apiutil.respond(res, 403, 'Forbidden (group is ready)')
        }
        return checkSchedule(res, group, _class, group.owner.email, repetitions, group.privilege, start, stop).then(function(checkingSuccessed) {
            if (!checkingSuccessed) {
                return false
            }
            if (name === group.name &&
                start.toISOString() === group.dates[0].start.toISOString() &&
                stop.toISOString() === group.dates[0].stop.toISOString() &&
                state === group.state &&
                _class === group.class &&
                repetitions === group.repetitions) {
                if (isInternal) {
                    return dbapi.loadDevicesBySerials(group.devices)
                        .then(devices => apiutil.respond(res, 200, 'Unchanged (group)', {group: {id: group.id, devices: devices}}))
                }
                else {
                    return apiutil.respond(res, 200, 'Unchanged (group)', {group: group})
                }
            }
            const duration = apiutil.isOriginGroup(_class) ?
                0 : group.devices.length * (stop - start) * (repetitions + 1)
            const dates = apiutil.computeGroupDates({start: start, stop: stop}, _class, repetitions)
            if (start < group.dates[0].start ||
                stop > group.dates[0].stop ||
                repetitions > group.repetitions ||
                _class !== group.class) {
                return checkConflicts(id, group.devices, dates)
                    .then(function(conflicts) {
                        if (!conflicts.length) {
                            return updateUserGroup(group, {
                                name: name
                                , state: state
                                , class: _class
                                , isActive: isActive
                                , repetitions: repetitions
                                , dates: dates
                                , duration: duration
                            })
                        }
                        return apiutil.respond(res, 409, 'Conflicts Information', {conflicts: conflicts})
                    })
            }
            return updateUserGroup(group, {
                name: name
                , state: state
                , class: _class
                , isActive: isActive
                , repetitions: repetitions
                , dates: dates
                , duration: duration
            })
        })
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to update group: ', err.stack)
        })
        .finally(function() {
            lockutil.unlockGroup(lock)
        })
}
function getGroupDevices(req, res) {
    const id = req.params.id
    const bookable = req.query.bookable
    dbapi.getUserGroup(req.user.email, id).then(function(group) {
        if (!group) {
            apiutil.respond(res, 404, 'Not Found (group)')
            return
        }
        if (bookable) {
            if (apiutil.isOriginGroup(group.class)) {
                apiutil.respond(res, 400, 'Bad Request (group is not transient)')
                return
            }
            if (req.user.privilege === apiutil.ADMIN && req.user.email !== group.owner.email) {
                groupApiWrapper(group.owner.email, getGroupDevices, req, res)
                return
            }
            dbapi.loadBookableDevices(req.user.groups.subscribed, req.query.fields).then(function(devices) {
                Promise.map(devices, function(device) {
                    return device.serial
                })
                    .then(function(serials) {
                        return checkConflicts(group.id, serials, group.dates)
                            .then(function(conflicts) {
                                let bookableSerials = serials
                                conflicts.forEach(function(conflict) {
                                    bookableSerials = _.difference(bookableSerials, conflict.devices)
                                })
                                return bookableSerials
                            })
                    })
                    .then(function(bookableSerials) {
                        const deviceList = []
                        devices.forEach(function(device) {
                            if (bookableSerials.indexOf(device.serial) > -1) {
                                deviceList.push(apiutil.filterDevice(req, device))
                            }
                        })
                        apiutil.respond(res, 200, 'Devices Information', {devices: deviceList})
                    })
            })
        }
        else {
            Promise.map(group.devices, function(serial) {
                return getDevice(req, serial)
            })
                .then(function(devices) {
                    apiutil.respond(res, 200, 'Devices Information', {devices: devices})
                })
        }
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to get group devices: ', err.stack)
        })
}
export {createGroup}
export {createGroupFunc}
export {updateGroup}
export {deleteGroup}
export {deleteGroups}
export {getGroup}
export {getGroups}
export {getGroupUser}
export {getGroupUsers}
export {addGroupUser}
export {addGroupUsers}
export {removeGroupUser}
export {removeGroupUsers}
export {getGroupDevice}
export {getGroupDevices}
export {addGroupDevice}
export {addGroupDevices}
export {removeGroupDevice}
export {removeGroupDevices}
export default {
    createGroup: createGroup
    , createGroupFunc: createGroupFunc
    , updateGroup: updateGroup
    , deleteGroup: deleteGroup
    , deleteGroups: deleteGroups
    , getGroup: getGroup
    , getGroups: getGroups
    , getGroupUser: getGroupUser
    , getGroupUsers: getGroupUsers
    , addGroupUser: addGroupUser
    , addGroupUsers: addGroupUsers
    , removeGroupUser: removeGroupUser
    , removeGroupUsers: removeGroupUsers
    , getGroupDevice: getGroupDevice
    , getGroupDevices: getGroupDevices
    , addGroupDevice: addGroupDevice
    , addGroupDevices: addGroupDevices
    , removeGroupDevice: removeGroupDevice
    , removeGroupDevices: removeGroupDevices
}
