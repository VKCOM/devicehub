import _ from 'lodash'
import Promise from 'bluebird'
import dbapi from '../../../db/api.js'
import logger from '../../../util/logger.js'
import * as apiutil from '../../../util/apiutil.js'
import * as lockutil from '../../../util/lockutil.js'
import util from 'util'
import {v4 as uuidv4} from 'uuid'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import {WireRouter} from '../../../wire/router.js'
import * as fake from '../../../util/fakedevice.js'
var log = logger.createLogger('api:controllers:devices')

/* ------------------------------------ PRIVATE FUNCTIONS ------------------------------- */
function filterGenericDevices(req, res, devices) {
    if (req.headers.is_generator === '1') {
        apiutil.respond(res, 200, 'Devices Information', {
            devices: devices.map(function(device) {
                return apiutil.filterDevice(req, device)
            }).filter(function(dev) {
                return !dev.remoteConnect
            })
        })
    }
    else {
        apiutil.respond(res, 200, 'Devices Information', {
            devices: devices.map(function(device) {
                return apiutil.filterDevice(req, device)
            })
        })
    }
}
function getGenericDevices(req, res, loadDevices) {
    log.info(req.user)
    loadDevices(req.user.groups.subscribed, apiutil.prepareFieldsForMongoDb(req.query.fields)).then(function(devices) {
        let isGenerator = false // req.headers.is_generator === '1'
        if (isGenerator) {
            let count = 0
            const cb = device => {
                if (count === devices.length) {
                    filterGenericDevices(req, res, devices)
                    return
                }
                let adbPort = device.adbPort
                if (!adbPort) {
                    dbapi.initiallySetAdbPort(device.serial)
                        .then(port => {
                            if (port) {
                                log.info('Applied adb port ' + port + ' for ' + device.serial)
                                device.adbPort = port
                            }
                            else {
                                log.warn('Cant apply port for ' + device.serial)
                            }
                            count++
                            cb(devices[count])
                        })
                }
                else {
                    count++
                    cb(devices[count])
                }
            }
            cb(devices[count])
        }
        else {
            filterGenericDevices(req, res, devices)
        }
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to load device list: ', err.stack)
        })
}
function getDeviceFilteredGroups(serial, fields, bookingOnly) {
    return dbapi.getDeviceGroups(serial).then(function(groups) {
        return Promise.map(groups || [], function(group) {
            return !bookingOnly || !apiutil.isOriginGroup(group.class) ?
                group :
                'filtered'
        })
            .then(function(groups) {
                return _.without(groups, 'filtered').map(function(group) {
                    if (fields) {
                        return _.pick(apiutil.publishGroup(group), fields.split(','))
                    }
                    return apiutil.publishGroup(group)
                })
            })
    })
}
function extractStandardizableDevices(devices) {
    return dbapi.getTransientGroups().then(function(groups) {
        return Promise.map(devices, function(device) {
            return Promise.map(groups || [], function(group) {
                if (group.devices.indexOf(device.serial) > -1) {
                    return Promise.reject('booked')
                }
                return true
            })
                .then(function() {
                    return device
                })
                .catch(function(err) {
                    if (err !== 'booked') {
                        throw err
                    }
                    return err
                })
        })
            .then(function(devices) {
                return _.without(devices, 'booked')
            })
    })
}
function getStandardizableDevices(req, res) {
    dbapi.loadDevicesByOrigin(req.user.groups.subscribed, apiutil.prepareFieldsForMongoDb(req.query.fields)).then(function(devices) {
        extractStandardizableDevices(devices).then(function(devices) {
            filterGenericDevices(req, res, devices)
        })
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to load device list: ', err.stack)
        })
}
function removeDevice(serial, req, res) {
    const presentState = req.query.present
    const bookingState = req.query.booked
    const notesState = req.query.annotated
    const controllingState = req.query.controlled
    const anyPresentState = typeof presentState === 'undefined'
    const anyBookingState = typeof bookingState === 'undefined'
    const anyNotesState = typeof notesState === 'undefined'
    const anyControllingState = typeof controllingState === 'undefined'
    const lock = {}
    function deleteGroupDevice(email, id) {
        return dbapi.getUserGroup(email, id).then(function(group) {
            if (!group) {
                return 'not found'
            }
            if (group.devices.indexOf(serial) > -1) {
                return apiutil.isOriginGroup(group.class) ?
                    dbapi.removeOriginGroupDevice(group, serial) :
                    dbapi.removeGroupDevices(group, [serial])
            }
            return group
        })
    }
    function deleteDeviceInDatabase() {
        function wrappedDeleteDeviceInDatabase() {
            const result = {
                status: false
                , data: 'not deleted'
            }
            return dbapi.loadDeviceBySerial(serial).then(function(device) {
                if (device && device.group.id === device.group.origin) {
                    return deleteGroupDevice(device.group.owner.email, device.group.id)
                        // @ts-ignore
                        .then(function(group) {
                            if (group !== 'not found') {
                                return dbapi.deleteDevice(serial).then(function() {
                                    result.status = true
                                    result.data = 'deleted'
                                })
                            }
                            return false
                        })
                }
                return false
            })
                .then(function() {
                    return result
                })
        }
        return apiutil.setIntervalWrapper(wrappedDeleteDeviceInDatabase, 10, Math.random() * 500 + 50)
    }
    return dbapi.lockDeviceByOrigin(req.user.groups.subscribed, serial).then(function(stats) {
        if (stats.modifiedCount === 0) {
            return apiutil.lightComputeStats(res, stats)
        }
        const device = lock.device = stats.changes[0].new_val
        if (!anyPresentState && device.present !== presentState ||
            !anyControllingState && (device.owner === null) === controllingState ||
            !anyNotesState &&
                (typeof device.notes !== 'undefined' && device.notes !== '') !== notesState ||
            !anyBookingState && (device.group.id !== device.group.origin && !bookingState ||
                device.group.class === apiutil.STANDARD && bookingState)) {
            return 'unchanged'
        }
        if (device.group.class === apiutil.STANDARD) {
            return deleteDeviceInDatabase()
        }
        return dbapi.getDeviceTransientGroups(serial).then(function(groups) {
            if (groups?.length && !anyBookingState && !bookingState) {
                return 'unchanged'
            }
            return Promise.each(groups || [], function(group) {
                return deleteGroupDevice(group.owner.email, group.id)
            })
                .then(function() {
                    if (!groups?.length && !anyBookingState && bookingState) {
                        return 'unchanged'
                    }
                    return deleteDeviceInDatabase()
                })
        })
    })
        .finally(function() {
            lockutil.unlockDevice(lock)
        })
}

/* ------------------------------------ PUBLIC FUNCTIONS ------------------------------- */
function getDevices(req, res) {
    const target = req.query.target
    switch (target) {
    case apiutil.BOOKABLE:
        getGenericDevices(req, res, dbapi.loadBookableDevices)
        break
    case apiutil.ORIGIN:
        getGenericDevices(req, res, dbapi.loadDevicesByOrigin)
        break
    case apiutil.STANDARD:
        getGenericDevices(req, res, dbapi.loadStandardDevices)
        break
    case apiutil.STANDARDIZABLE:
        getStandardizableDevices(req, res)
        break
    default:
        getGenericDevices(req, res, dbapi.loadDevices)
    }
}
function getDeviceBySerial(req, res) {
    var serial = req.params.serial
    var fields = req.query.fields
    dbapi.loadDevice(req.user.groups.subscribed, serial)
        .then(device => {
            if (!device) {
                return res.status(404).json({
                    success: false
                    , description: 'Device not found'
                })
            }
            let responseDevice = apiutil.publishDevice(device, req)
            if (fields) {
                responseDevice = _.pick(device, fields.split(','))
            }
            res.json({
                success: true
                , description: 'Device Information'
                , device: responseDevice
            })
        })
        .catch(function(err) {
            log.error('Failed to load device "%s": ', serial, err.stack)
            apiutil.respond(res, 500, 'Failed to load device', {deviceSerial: serial})
        })
}
function getDeviceSize(req, res) {
    var serial = req.params.serial
    dbapi.getDeviceDisplaySize(serial)
        .then(response => {
            return res.status(200).json(response.display)
        })
        .catch(function(err) {
            log.info('Failed to get device size: ', err.stack)
            return res.status(200).json({height: 0, width: 0, scale: 0})
        })
}
function getDeviceGroups(req, res) {
    const serial = req.params.serial
    const fields = req.query.fields
    dbapi.loadDevice(req.user.groups.subscribed, serial).then(function(groups) {
        return groups
    })
        .then(function(devices) {
            if (!devices.length) {
                apiutil.respond(res, 404, 'Not Found (device)')
            }
            else {
                getDeviceFilteredGroups(serial, fields, false)
                    .then(function(groups) {
                        return apiutil.respond(res, 200, 'Groups Information', {groups: groups})
                    })
            }
        })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to get device groups: ', err.stack)
        })
}
function getDeviceOwner(req, res) {
    var serial = req.params.serial
    dbapi.getDeviceGroupOwner(serial)
        .then(response => {
            if (!response) {
                return res.status(404).json({
                    success: false
                    , description: 'Device not found'
                })
            }
            return res.status(200).json(response)
        })
        .catch(function(err) {
            log.info('Failed to get device owner: ', err.stack)
            apiutil.respond(res, 500, 'Failed to get device owner')
        })
}
function getDeviceType(req, res) {
    var serial = req.params.serial
    dbapi.getDeviceType(serial)
        .then(response => {
            return res.status(200).json(response)
        })
        .catch(function(err) {
            log.info('Failed to get device type: ', err.stack)
            return res.status(200).json({deviceType: null})
        })
}
function getDeviceBookings(req, res) {
    const serial = req.params.serial
    const fields = req.query.fields
    dbapi.loadDevice(req.user.groups.subscribed, serial).then(function(groups) {
        return groups
    })
        .then(function(devices) {
            if (!devices.length) {
                apiutil.respond(res, 404, 'Not Found (device)')
            }
            else {
                getDeviceFilteredGroups(serial, fields, true)
                    .then(function(bookings) {
                        apiutil.respond(res, 200, 'Bookings Information', {bookings: bookings})
                    })
            }
        })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to get device bookings: ', err.stack)
        })
}
function addOriginGroupDevices(req, res) {
    const serials = apiutil.getBodyParameter(req.body, 'serials')
    const fields = apiutil.getQueryParameter(req.query.fields)
    const target = apiutil.getQueryParameter(req.query.redirected) ? 'device' : 'devices'

    function askUpdateDeviceOriginGroup(group, serial) {
        return new Promise(function(resolve, reject) {
            const signature = util.format('%s', uuidv4()).replace(/-/g, '')
            let messageListener
            const responseTimer = setTimeout(function() {
                req.options.channelRouter.removeListener(wireutil.global, messageListener)
                apiutil.respond(res, 504, 'Gateway Time-out')
                reject('timeout')
            }, apiutil.GRPC_WAIT_TIMEOUT)
            messageListener = new WireRouter()
                .on(wire.DeviceOriginGroupMessage, function(channel, message) {
                    if (message.signature === signature) {
                        clearTimeout(responseTimer)
                        req.options.channelRouter.removeListener(wireutil.global, messageListener)
                        dbapi.loadDeviceBySerial(serial).then(function(device) {
                            if (fields) {
                                resolve(_.pick(apiutil.publishDevice(device, req), fields.split(',')))
                            }
                            else {
                                resolve(apiutil.publishDevice(device, req))
                            }
                        })
                    }
                })
                .handler()
            req.options.channelRouter.on(wireutil.global, messageListener)
            return dbapi.askUpdateDeviceOriginGroup(serial, group, signature)
        })
    }
    function updateDeviceOriginGroup(group, serial) {
        const lock = {}
        return dbapi.lockDeviceByOrigin(req.user.groups.subscribed, serial).then(function(stats) {
            if (stats.modifiedCount === 0) {
                return apiutil.lightComputeStats(res, stats)
            }
            lock.device = stats.changes[0].new_val
            return dbapi.isUpdateDeviceOriginGroupAllowed(serial, group)
                .then(function(updatingAllowed) {
                    if (!updatingAllowed) {
                        apiutil.respond(res, 403, 'Forbidden (device is currently booked)')
                        return Promise.reject('booked')
                    }
                    return askUpdateDeviceOriginGroup(group, serial)
                })
        })
            .finally(function() {
                lockutil.unlockDevice(lock)
            })
    }
    function updateDevicesOriginGroup(group, serials) {
        let results = []
        return Promise.each(serials, function(serial) {
            return updateDeviceOriginGroup(group, serial).then(function(result) {
                results.push(result)
            })
        })
            .then(function() {

                /** @type {any} */
                const result = target === 'device' ? {device: {}} : {devices: []}
                results = _.without(results, 'unchanged')
                if (!results.length) {
                    return apiutil.respond(res, 200, `Unchanged (${target})`, result)
                }
                results = _.without(results, 'not found')
                if (!results.length) {
                    return apiutil.respond(res, 404, `Not Found (${target})`)
                }
                if (target === 'device') {
                    result.device = results[0]
                }
                else {
                    result.devices = results
                }
                return apiutil.respond(res, 200, `Updated (${target})`, result)
            })
            .catch(function(err) {
                if (err !== 'booked' && err !== 'timeout' && err !== 'busy') {
                    throw err
                }
            })
    }

    return dbapi.getUserGroup(req.user.email, req.params.id).then(function(group) {
        if (!group) {
            return false
        }

        if (!apiutil.isOriginGroup(group.class)) {
            return apiutil.respond(res, 400, 'Bad Request (this group cannot act as an origin one)')
        }
        if (typeof serials !== 'undefined') {
            return updateDevicesOriginGroup(group, _.without(serials.split(','), '').filter(function(serial) {
                return group.devices.indexOf(serial) < 0
            }))
        }
        return dbapi.loadDevicesByOrigin(req.user.groups.subscribed).then(function(devices) {
            if (group.class === apiutil.BOOKABLE) {
                return devices
            }
            return extractStandardizableDevices(devices)
        })
            .then(function(devices) {
                const serials = []
                devices.forEach(function(device) {
                    if (group.devices.indexOf(device.serial) < 0) {
                        serials.push(device.serial)
                    }
                })
                return updateDevicesOriginGroup(group, serials)
            })
    })
        .catch(function(err) {
            apiutil.internalError(res, `Failed to update ${target} origin group: `, err.stack)
        })
}
function addOriginGroupDevice(req, res) {
    apiutil.redirectApiWrapper('serial', addOriginGroupDevices, req, res)
}
function removeOriginGroupDevices(req, res) {
    return dbapi.getUserGroup(req.user.email, req.params.id).then(function(group) {
        if (!group) {
            return false
        }

        if (!apiutil.checkBodyParameter(req.body, 'serials')) {
            req.body = {serials: group.devices.join()}
        }
        return dbapi.getRootGroup().then(function(group) {
            req.params.id = group?.id
            return addOriginGroupDevices(req, res)
        })
    })
}
function removeOriginGroupDevice(req, res) {
    apiutil.redirectApiWrapper('serial', removeOriginGroupDevices, req, res)
}
function putDeviceInfoBySerial(req, res) {
    const serial = req.params.serial
    const body = req.body
    dbapi.loadDeviceBySerial(serial)
        .then((data) => {
            if (!data) {
                return apiutil.respond(res, 404, `Not Found (${serial})`)
            }
            var updates = []
            // Update fields based on given body
            if (_.has(body, 'note')) {
                updates.push(dbapi.setDeviceNote(serial, body.note))
            }
            if (_.has(body, 'status')) {
                switch (body.status) {
                case 'Disconnected':
                    updates.push(dbapi.setDeviceAbsent(serial))
                    break
                case 'Unhealthy':
                    updates.push(dbapi.saveDeviceStatus(serial, 7))
                    break
                default:
                    apiutil.respond(res, 400, 'Unknown status requested')
                    break
                }
            }
            if (updates.length === 0) {
                return apiutil.respond(res, 400, 'No content to update')
            }
            return Promise.all(updates)
                .then(function() {
                    apiutil.respond(res, 200)
                })
        })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to update device: ', err.stack)
        })
}
function deleteDevices(req, res) {
    const serials = apiutil.getBodyParameter(req.body, 'serials')
    const target = apiutil.getQueryParameter(req.query.redirected) ? 'device' : 'devices'
    function removeDevices(serials) {
        let results = []
        return Promise.each(serials, function(serial) {
            return removeDevice(serial, req, res).then(function(result) {
                if (result === 'not deleted') {
                    apiutil.respond(res, 503, 'Server too busy [code: 2], please try again later')
                    return Promise.reject('busy')
                }
                return results.push(result)
            })
        })
            .then(function() {
                results = _.without(results, 'unchanged')
                if (!results.length) {
                    return apiutil.respond(res, 200, `Unchanged (${target})`)
                }
                if (!_.without(results, 'not found').length) {
                    return apiutil.respond(res, 404, `Not Found (${target})`)
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
        if (typeof serials === 'undefined') {
            return dbapi.loadDevicesByOrigin(req.user.groups.subscribed).then(function(devices) {
                return removeDevices(devices.map(function(device) {
                    return device.serial
                }))
            })
        }
        else {
            return removeDevices(_.without(serials.split(','), ''))
        }
    })()
        .catch(function(err) {
            apiutil.internalError(res, `Failed to delete ${target}: `, err.stack)
        })
}
function putDeviceBySerial(req, res) {
    apiutil.redirectApiWrapper('serial', putDeviceInfoBySerial, req, res)
}
function deleteDevice(req, res) {
    apiutil.redirectApiWrapper('serial', deleteDevices, req, res)
}
function updateStorageInfo(req, res) {
    const serial = req.params.serial
    const storageId = req.query.storageId
    const place = req.query.place
    const adbPort = parseInt(req.query.adbPort, 10)
    dbapi.loadDeviceBySerial(serial)
        .then((data) => {
            if (data) {
                if (storageId) {
                    dbapi.setDeviceStorageId(serial, storageId)
                }
                if (place) {
                    dbapi.setDevicePlace(serial, place)
                }
                if (adbPort) {
                    dbapi.setAdbPort(serial, adbPort)
                }
                apiutil.respond(res, 200, 'Device info updated')
            }
            else {
                apiutil.respond(res, 400, 'Device is not exist')
            }
        })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to update device: ', err.stack)
        })
}
function getAdbRange(req, res) {
    apiutil.respond(res, 200, 'Selected adb range', {adbRange: dbapi.getAdbRange()})
}
function renewAdbPort(req, res) {
    const serial = req.params.serial
    dbapi.initiallySetAdbPort(serial)
        .then(port => {
            if (port) {
                log.info('Applied adb port ' + port + ' for ' + serial)
                apiutil.respond(res, 200, 'Adb port updated', {port: port})
            }
            else {
                log.warn('Cant apply port for ' + serial)
                apiutil.respond(res, 200, 'Adb port update failed', {port: null})
            }
        })
}

function generateFakeDevice(req, res) {
    let number = req.query.number
    function next() {
        return fake.generate('fake-device').then(function(serial) {
            log.info('Created fake device "%s"', serial)
            return --number ? next() : null
        })
    }
    return next()
        .then(function() {
            apiutil.respond(res, 200, 'Fake devices generated')
        })
        .catch(function(err) {
            log.error('Fake device creation had an error:', err.stack)
            apiutil.respond(res, 500, 'Fake devices generation failed')
        })
}

export {getDevices}
export {putDeviceBySerial}
export {getDeviceBySerial}
export {getDeviceSize}
export {getDeviceOwner}
export {getDeviceGroups}
export {getDeviceType}
export {getDeviceBookings}
export {addOriginGroupDevice}
export {addOriginGroupDevices}
export {removeOriginGroupDevice}
export {removeOriginGroupDevices}
export {deleteDevice}
export {deleteDevices}
export {updateStorageInfo}
export {getAdbRange}
export {renewAdbPort}
export {generateFakeDevice}
export default {
    getDevices: getDevices
    , putDeviceBySerial: putDeviceBySerial
    , getDeviceBySerial: getDeviceBySerial
    , getDeviceSize: getDeviceSize
    , getDeviceOwner: getDeviceOwner
    , getDeviceGroups: getDeviceGroups
    , getDeviceType: getDeviceType
    , getDeviceBookings: getDeviceBookings
    , addOriginGroupDevice: addOriginGroupDevice
    , addOriginGroupDevices: addOriginGroupDevices
    , removeOriginGroupDevice: removeOriginGroupDevice
    , removeOriginGroupDevices: removeOriginGroupDevices
    , deleteDevice: deleteDevice
    , deleteDevices: deleteDevices
    , updateStorageInfo: updateStorageInfo
    , getAdbRange: getAdbRange
    , renewAdbPort: renewAdbPort
    , generateFakeDevice: generateFakeDevice
}
