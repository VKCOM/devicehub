import util from 'util'
import _ from 'lodash'
import {v4 as uuidv4} from 'uuid'
import adbkit from '@irdk/adbkit'
import * as dbapi from '../../../db/api.js'
import logger from '../../../util/logger.js'
import datautil from '../../../util/datautil.js'
import deviceutil from '../../../util/deviceutil.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import {WireRouter} from '../../../wire/router.js'
import * as apiutil from '../../../util/apiutil.js'
import * as jwtutil from '../../../util/jwtutil.js'
import * as lockutil from '../../../util/lockutil.js'
import * as Sentry from '@sentry/node'
let log = logger.createLogger('api:controllers:user')


/**
 * Safe version of setTimeout
 * @param {Callable} callback the callback to run
 * @param {number} timeout the timeout to wait
 * @returns {number} setTimeout id
 */
function setTimeoutS(callback, timeout) {
    return setTimeout(function() {
        try {
            return callback()
        }
        catch (e) {
            log.error('Error when executing timeout: ', e.stack)
            return null
        }
    }, timeout)
}

function getUser(req, res) {
    // delete req.user.groups.lock
    res.json({
        success: true
        , user: req.user
    })
}

function getUserDevices(req, res) {
    var fields = req.query.fields
    log.info('Loading user devices')
    dbapi.loadUserDevices(req.user.email)
        .then(list => {
            log.info('Devices list from db - ' + list)
            let deviceList = []
            list.forEach(function(device) {
                datautil.normalize(device, req.user)
                let responseDevice = device
                if (fields) {
                    responseDevice = _.pick(device, fields.split(','))
                }
                deviceList.push(responseDevice)
            })
            log.info('Devices list after normalization - ' + deviceList)
            res.json({
                success: true
                , description: 'Information about controlled devices'
                , devices: deviceList
            })
        })
        .catch(err => {
            log.error('Failed to load device list: ', err.stack)
            apiutil.respond(res, 500, 'Failed to load device list')
        })
}

function getUserDeviceBySerial(req, res) {
    var serial = req.params.serial
    var fields = req.query.fields
    dbapi.loadDevice(req.user.groups.subscribed, serial)
        .then(function(device) {
            if (!device) {
                return res.status(404).json({
                    success: false
                    , description: 'Device not found'
                })
            }
            datautil.normalize(device, req.user)
            if (!deviceutil.isOwnedByUser(device, req.user)) {
                return res.status(403).json({
                    success: false
                    , description: 'Device is not owned by you'
                })
            }
            var responseDevice = device
            if (fields) {
                responseDevice = _.pick(device, fields.split(','))
            }
            res.json({
                success: true
                , description: 'Controlled device information'
                , device: responseDevice
            })
        })
        .catch(function(err) {
            log.error('Failed to load device "%s": ', req.params.serial, err.stack)
            apiutil.respond(res, 500, 'Failed to load device', {deviceSerial: req.params.serial})
        })
}

function addUserDevice(req, res) {
    let serial = Object.prototype.hasOwnProperty.call(req, 'body') ? req.body.serial : req.params.serial
    let timeout = Object.prototype.hasOwnProperty.call(req, 'body') ? req.body.timeout ||
        null : req.query.timeout || null
    const lock = {}
    lockutil.lockGenericDevice(req, res, lock, dbapi.lockDeviceByCurrent)
        .then(function(lockingSuccessed) {
            if (lockingSuccessed) {
                const device = lock.device
                datautil.normalize(device, req.user)
                if (!deviceutil.isAddable(device, req.user)) {
                    return res.status(403).json({
                        success: false
                        , description: 'Device is being used or not available'
                    })
                }
                // Timer will be called if no JoinGroupMessage is received till 5 seconds
                let responseTimer = setTimeoutS(function() {
                    req.options.channelRouter.removeListener(wireutil.global, messageListener)
                    return apiutil.respond(res, 504, 'Device is not responding')
                }, apiutil.GRPC_WAIT_TIMEOUT)
                let messageListener = new WireRouter()
                    .on(wire.JoinGroupMessage, function(channel, message) {
                        log.info(device.serial + ' added to user group ' + req.user)
                        if (message.serial === serial && message.owner.email === req.user.email) {
                            clearTimeout(responseTimer)
                            req.options.channelRouter.removeListener(wireutil.global, messageListener)
                            return res.json({
                                success: true
                                , description: 'Device successfully added'
                            })
                        }
                    })
                    .handler()
                req.options.channelRouter.on(wireutil.global, messageListener)
                let usage = 'automation'
                req.options.push.send([
                    device.channel
                    , wireutil.envelope(new wire.GroupMessage(new wire.OwnerMessage(req.user.email, req.user.name, req.user.group), timeout, wireutil.toDeviceRequirements({
                        serial: {
                            value: serial
                            , match: 'exact'
                        }
                    }), usage))
                ])
            }
            return false
        })
        .catch(function(err) {
            apiutil.internalError(res, `Failed to take control of ${serial} device: `, err.stack)
        })
        .finally(function() {
            lockutil.unlockDevice(lock)
        })
}

function deleteUserDeviceBySerial(req, res) {
    const isInternal = req.isInternal
    let serial
    if (isInternal) {
        serial = req.serial
    }
    else {
        serial = req.params.serial
    }
    dbapi.loadDevice(req.user.groups.subscribed, serial)
        .then(function(device) {
            if (!device) {
                if (isInternal) {
                    return false
                }
                else {
                    return res.status(404).json({
                        success: false
                        , description: 'Device not found'
                    })
                }
            }
            datautil.normalize(device, req.user)
            if (!deviceutil.isOwnedByUser(device, req.user)) {
                Sentry.addBreadcrumb({
                    data: {device, user: req.user}
                    , message: 'This device is not owned by this user.'
                    , level: 'warning'
                    , type: 'default'
                })
                if (isInternal) {
                    return false
                }
                else {
                    Sentry.captureMessage('403 someone tried to release somebody elses device')
                    return res.status(403).json({
                        success: false
                        , description: 'Releasing this device is not possible as it does not belong to you'
                    })
                }
            }
            // Timer will be called if no JoinGroupMessage is received till 5 seconds
            var responseTimer = setTimeoutS(function() {
                req.options.channelRouter.removeListener(wireutil.global, messageListener)
                if (isInternal) {
                    return false
                }
                else {
                    return apiutil.respond(res, 504, 'Device is not responding')
                }
            }, apiutil.GRPC_WAIT_TIMEOUT)
            var messageListener = new WireRouter()
                .on(wire.LeaveGroupMessage, function(channel, message) {
                    if (message.serial === serial &&
                (message.owner.email === req.user.email || req.user.privilege === 'admin')) {
                        clearTimeout(responseTimer)
                        req.options.channelRouter.removeListener(wireutil.global, messageListener)
                        if (isInternal) {
                            return true
                        }
                        else {
                            return res.json({
                                success: true
                                , description: 'Device successfully removed'
                            })
                        }
                    }
                })
                .handler()
            req.options.channelRouter.on(wireutil.global, messageListener)
            req.options.push.send([
                device.channel
                , wireutil.envelope(new wire.UngroupMessage(wireutil.toDeviceRequirements({
                    serial: {
                        value: serial
                        , match: 'exact'
                    }
                })))
            ])
        })
        .catch(function(err) {
            let errSerial
            if (isInternal) {
                errSerial = req.serial
            }
            else {
                errSerial = req.params.serial
            }
            log.error('Failed to load device "%s": ', errSerial, err.stack)
            if (isInternal) {
                return false
            }
            else {
                apiutil.respond(res, 500, 'Internal Server Error')
            }
        })
}

function remoteConnectUserDeviceBySerial(req, res) {
    let serial = req.params.serial
    dbapi.loadDevice(req.user.groups.subscribed, serial)
        .then(function(device) {
            if (!device) {
                return res.status(404).json({
                    success: false
                    , description: 'Device not found'
                })
            }
            datautil.normalize(device, req.user)
            if (!deviceutil.isOwnedByUser(device, req.user)) {
                return res.status(403).json({
                    success: false
                    , description: 'Device is not owned by you or is not available'
                })
            }
            let responseChannel = 'txn_' + uuidv4()
            req.options.sub.subscribe(responseChannel)
            // Timer will be called if no JoinGroupMessage is received till 5 seconds
            let timer = setTimeoutS(function() {
                req.options.channelRouter.removeListener(responseChannel, messageListener)
                req.options.sub.unsubscribe(responseChannel)
                return apiutil.respond(res, 504, 'Device is not responding')
            }, apiutil.GRPC_WAIT_TIMEOUT)
            let messageListener = new WireRouter()
                .on(wire.ConnectStartedMessage, function(channel, message) {
                    if (message.serial === serial) {
                        clearTimeout(timer)
                        req.options.sub.unsubscribe(responseChannel)
                        req.options.channelRouter.removeListener(responseChannel, messageListener)
                        return res.json({
                            success: true
                            , description: 'Remote connection is enabled'
                            , remoteConnectUrl: message.url
                        })
                    }
                })
                .handler()
            req.options.channelRouter.on(responseChannel, messageListener)
            req.options.push.send([
                device.channel
                , wireutil.transaction(responseChannel, new wire.ConnectStartMessage())
            ])
        })
        .catch(function(err) {
            log.error('Failed to load device "%s": ', req.params.serial, err.stack)
            apiutil.respond(res, 500, 'Internal Server Error')
        })
}

function remoteDisconnectUserDeviceBySerial(req, res) {
    const isInternal = req.isInternal
    let serial
    if (isInternal) {
        serial = req.serial
    }
    else {
        serial = req.params.serial
    }
    dbapi.loadDevice(req.user.groups.subscribed, serial)
        .then(function(device) {
            if (!device) {
                if (isInternal) {
                    return false
                }
                else {
                    return res.status(404).json({
                        success: false
                        , description: 'Device not found'
                    })
                }
            }
            datautil.normalize(device, req.user)
            if (!deviceutil.isOwnedByUser(device, req.user)) {
                if (isInternal) {
                    return false
                }
                else {
                    return res.status(403).json({
                        success: false
                        , description: 'Device is not owned by you or is not available'
                    })
                }
            }
            var responseChannel = 'txn_' + uuidv4()
            req.options.sub.subscribe(responseChannel)
            // Timer will be called if no JoinGroupMessage is received till 5 seconds
            var timer = setTimeoutS(function() {
                req.options.channelRouter.removeListener(responseChannel, messageListener)
                req.options.sub.unsubscribe(responseChannel)
                if (isInternal) {
                    return false
                }
                else {
                    return apiutil.respond(res, 504, 'Device is not responding')
                }
            }, apiutil.GRPC_WAIT_TIMEOUT)
            var messageListener = new WireRouter()
                .on(wire.ConnectStoppedMessage, function(channel, message) {
                    if (message.serial === serial) {
                        clearTimeout(timer)
                        req.options.sub.unsubscribe(responseChannel)
                        req.options.channelRouter.removeListener(responseChannel, messageListener)
                        if (isInternal) {
                            return true
                        }
                        else {
                            return res.json({
                                success: true
                                , description: 'Device remote disconnected successfully'
                            })
                        }
                    }
                })
                .handler()
            req.options.channelRouter.on(responseChannel, messageListener)
            req.options.push.send([
                device.channel
                , wireutil.transaction(responseChannel, new wire.ConnectStopMessage())
            ])
        })
        .catch(function(err) {
            let errSerial
            if (isInternal) {
                errSerial = req.serial
            }
            else {
                errSerial = req.params.serial
            }
            log.error('Failed to load device "%s": ', errSerial, err.stack)
            Sentry.captureMessage(`Failed to load device ${errSerial}`)
            apiutil.respond(res, 500, 'Failed to load device', {deviceSerial: errSerial})
        })
}

function getUserAccessTokens(req, res) {
    return dbapi.loadAccessTokens(req.user.email)
        .then(function(list) {
            var titles = []
            list.forEach(function(token) {
                titles.push(token.title)
            })
            res.json({
                success: true
                , titles: titles
            })
        })
        .catch(function(err) {
            log.error('Failed to load tokens: ', err.stack)
            apiutil.respond(res, 500, 'Internal Server Error')
        })
}

function addAdbPublicKey(req, res) {
    const data = req.body
    adbkit.Adb.util.parsePublicKey(data.publickey).then(function(key) {
        return dbapi.lookupUsersByAdbKey(key.fingerprint)
            .then(function(adbKeys) {
                return adbKeys
            }).then(function(users) {
                return {
                    key: {
                        title: data.title || key.comment
                        , fingerprint: key.fingerprint
                    }
                    , users: users
                }
            })
    }).then(function(data) {
        if (data.users.length) {
            return res.json({
                success: true
                , fingerprint: data.key.fingerprint
            })
        }
        else {
            return dbapi.insertUserAdbKey(req.user.email, data.key)
                .then(function() {
                    return res.json({
                        success: true
                        , fingerprint: data.key.fingerprint
                    })
                })
        }
    }).then(function() {
        req.options.push.send([
            req.user.group
            , wireutil.envelope(new wire.AdbKeysUpdatedMessage())
        ])
    }).catch(dbapi.DuplicateSecondaryIndexError, function() {
        // No-op
        return res.status(208).json({
            success: true
            , message: 'Key was already added'
        })
    }).catch(function(err) {
        log.error('Failed to insert a new ADB key fingerprint: ', err.stack)
        return apiutil.respond(res, 500, 'Unable to insert the new ADB key fingerprint into the database')
    })
}

function removeAdbPublicKey(req, res) {
    const fingerprint = req.body.fingerprint
    dbapi.deleteUserAdbKey(req.user.email, fingerprint)
        .then(() => {
        // TODO: check that key was really deleted
            return res.status(200).json({
                success: true
                , message: 'Key with fingerprint ' + fingerprint + ' was deleted'
            })
        })
        .catch(() => {
            return apiutil.respond(res, 500, 'Unable to delete key from database')
        })
}

function getAccessToken(req, res) {
    const id = req.params.id
    dbapi.loadAccessToken(id).then(function(token) {
        if (!token || token.email !== req.user.email) {
            apiutil.respond(res, 404, 'Not Found (access token)')
        }
        else {
            apiutil.respond(res, 200, 'Access Token Information', {
                token: apiutil.publishAccessToken(token)
            })
        }
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to delete access token "%s": ', id, err.stack)
        })
}

function getAccessTokens(req, res) {
    dbapi.loadAccessTokens(req.user.email).then(function(cursor) {
        Promise.promisify(cursor.toArray, cursor)().then(function(tokens) {
            const tokenList = []
            tokens.forEach(function(token) {
                tokenList.push(apiutil.publishAccessToken(token))
            })
            apiutil.respond(res, 200, 'Access Tokens Information', {tokens: tokenList})
        })
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to get access tokens: ', err.stack)
        })
}

function createAccessToken(req, res) {
    const title = req.query.title
    const jwt = jwtutil.encode({
        payload: {
            email: req.user.email
            , name: req.user.name
        }
        , secret: req.options.secret
    })
    const id = util.format('%s-%s', uuidv4(), uuidv4()).replace(/-/g, '')
    dbapi.saveUserAccessToken(req.user.email, {
        title: title
        , id: id
        , jwt: jwt
    })
        .then(function(token) {
            req.options.pushdev.send([
                req.user.group
                , wireutil.envelope(new wire.UpdateAccessTokenMessage())
            ])
            apiutil.respond(res, 201, 'Created (access token)', {token: apiutil.publishAccessToken(token)})
        })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to create access token "%s": ', title, err.stack)
        })
}

function deleteAccessTokens(req, res) {
    dbapi.removeUserAccessTokens(req.user.email).then(function(stats) {
        if (!stats.deleted) {
            apiutil.respond(res, 200, 'Unchanged (access tokens)')
        }
        else {
            req.options.pushdev.send([
                req.user.group
                , wireutil.envelope(new wire.UpdateAccessTokenMessage())
            ])
            apiutil.respond(res, 200, 'Deleted (access tokens)')
        }
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to delete access tokens: ', err.stack)
        })
}

function deleteAccessToken(req, res) {
    const id = req.params.id
    dbapi.loadAccessToken(id).then(function(token) {
        if (!token || token.email !== req.user.email) {
            apiutil.respond(res, 404, 'Not Found (access token)')
        }
        else {
            dbapi.removeAccessToken(id).then(function(stats) {
                if (!stats.deleted) {
                    apiutil.respond(res, 404, 'Not Found (access token)')
                }
                else {
                    req.options.pushdev.send([
                        req.user.group
                        , wireutil.envelope(new wire.UpdateAccessTokenMessage())
                    ])
                    apiutil.respond(res, 200, 'Deleted (access token)')
                }
            })
        }
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to delete access token "%s": ', id, err.stack)
        })
}

export {getUser}
export {getUserDevices}
export {addUserDevice}
export {getUserDeviceBySerial}
export {deleteUserDeviceBySerial}
export {remoteConnectUserDeviceBySerial}
export {remoteDisconnectUserDeviceBySerial}
export {getUserAccessTokens}
export {addAdbPublicKey}
export {removeAdbPublicKey}
export {addUserDevice as addUserDeviceV2}
export {getAccessTokens}
export {getAccessToken}
export {createAccessToken}
export {deleteAccessToken}
export {deleteAccessTokens}
export default {
    getUser: getUser
    , getUserDevices: getUserDevices
    , addUserDevice: addUserDevice
    , getUserDeviceBySerial: getUserDeviceBySerial
    , deleteUserDeviceBySerial: deleteUserDeviceBySerial
    , remoteConnectUserDeviceBySerial: remoteConnectUserDeviceBySerial
    , remoteDisconnectUserDeviceBySerial: remoteDisconnectUserDeviceBySerial
    , getUserAccessTokens: getUserAccessTokens
    , addAdbPublicKey: addAdbPublicKey
    , removeAdbPublicKey: removeAdbPublicKey
    , addUserDeviceV2: addUserDevice
    , getAccessTokens: getAccessTokens
    , getAccessToken: getAccessToken
    , createAccessToken: createAccessToken
    , deleteAccessToken: deleteAccessToken
    , deleteAccessTokens: deleteAccessTokens
}
