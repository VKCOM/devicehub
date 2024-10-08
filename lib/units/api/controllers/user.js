import util from 'util'
import _ from 'lodash'
import Promise from 'bluebird'
import uuid from 'uuid'
import adbkit from '@devicefarmer/adbkit'
import dbapi from '../../../db/api.mjs'
import logger from '../../../util/logger.js'
import datautil from '../../../util/datautil.js'
import deviceutil from '../../../util/deviceutil.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import wirerouter from '../../../wire/router.js'
import apiutil from '../../../util/apiutil.js'
import * as jwtutil from '../../../util/jwtutil.js'
import lockutil from '../../../util/lockutil.js'
let log = logger.createLogger('api:controllers:user')
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
        res.status(500).json({
            success: false
            , description: 'Internal Server Error'
        })
    })
}
function getUserDeviceBySerial(req, res) {
    var serial = req.path.serial
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
        res.status(500).json({
            success: false
            , description: 'Internal Server Error'
        })
    })
}
function addUserDevice(req, res) {
    let serial = Object.prototype.hasOwnProperty.call(req, 'body') ? req.body.serial : req.path.serial
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
            let responseTimer = setTimeout(function() {
                req.options.channelRouter.removeListener(wireutil.global, messageListener)
                return res.status(504).json({
                    success: false
                    , description: 'Device is not responding'
                })
            }, apiutil.GRPC_WAIT_TIMEOUT)
            let messageListener = wirerouter()
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
        serial = req.path.serial
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
                    , description: 'Releasing this device is not possible as it does not belong to you'
                })
            }
        }
        // Timer will be called if no JoinGroupMessage is received till 5 seconds
        var responseTimer = setTimeout(function() {
            req.options.channelRouter.removeListener(wireutil.global, messageListener)
            if (isInternal) {
                return false
            }
            else {
                return res.status(504).json({
                    success: false
                    , description: 'Device is not responding'
                })
            }
        }, apiutil.GRPC_WAIT_TIMEOUT)
        var messageListener = wirerouter()
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
            errSerial = req.path.serial
        }
        log.error('Failed to load device "%s": ', errSerial, err.stack)
        if (isInternal) {
            return false
        }
        else {
            res.status(500).json({
                success: false
                , description: 'Internal Server Error'
            })
        }
    })
}
function remoteConnectUserDeviceBySerial(req, res) {
    let serial = req.path.serial
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
        let responseChannel = 'txn_' + uuid.v4()
        req.options.sub.subscribe(responseChannel)
        // Timer will be called if no JoinGroupMessage is received till 5 seconds
        let timer = setTimeout(function() {
            req.options.channelRouter.removeListener(responseChannel, messageListener)
            req.options.sub.unsubscribe(responseChannel)
            return res.status(504).json({
                success: false
                , description: 'Device is not responding'
            })
        }, apiutil.GRPC_WAIT_TIMEOUT)
        let messageListener = wirerouter()
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
        res.status(500).json({
            success: false
            , description: 'Internal Server Error'
        })
    })
}
function remoteDisconnectUserDeviceBySerial(req, res) {
    const isInternal = req.isInternal
    let serial
    if (isInternal) {
        serial = req.serial
    }
    else {
        serial = req.path.serial
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
        var responseChannel = 'txn_' + uuid.v4()
        req.options.sub.subscribe(responseChannel)
        // Timer will be called if no JoinGroupMessage is received till 5 seconds
        var timer = setTimeout(function() {
            req.options.channelRouter.removeListener(responseChannel, messageListener)
            req.options.sub.unsubscribe(responseChannel)
            if (isInternal) {
                return false
            }
            else {
                return res.status(504).json({
                    success: false
                    , description: 'Device is not responding'
                })
            }
        }, apiutil.GRPC_WAIT_TIMEOUT)
        var messageListener = wirerouter()
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
            errSerial = req.path.serial
        }
        log.error('Failed to load device "%s": ', errSerial, err.stack)
        res.status(500).json({
            success: false
            , description: 'Internal Server Error'
        })
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
        res.status(500).json({
            success: false
        })
    })
}
function addAdbPublicKey(req, res) {
    var data = req.body
    adbkit.Adb.util.parsePublicKey(data.publickey)
        .then(function(key) {
        return dbapi.lookupUsersByAdbKey(key.fingerprint)
            .then(function(adbKeys) {
            return adbKeys
        })
            .then(function(users) {
            return {
                key: {
                    title: data.title || key.comment
                    , fingerprint: key.fingerprint
                }
                , users: users
            }
        })
    })
        .then(function(data) {
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
    })
        .then(function() {
        req.options.push.send([
            req.user.group
            , wireutil.envelope(new wire.AdbKeysUpdatedMessage())
        ])
    })
        .catch(dbapi.DuplicateSecondaryIndexError, function() {
        // No-op
        return res.status(208).json({
            success: true
            , message: 'Key was already added'
        })
    }).catch(function(err) {
        log.error('Failed to insert a new ADB key fingerprint: ', err.stack)
        return res.status(500).json({
            success: false
            , message: 'Unable to insert the new ADB key fingerprint into the database'
        })
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
        return res.status(500).json({
            success: false
            , message: 'Unable to delete key from database'
        })
    })
}
function getAccessToken(req, res) {
    const id = req.path.id
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
    const id = util.format('%s-%s', uuid.v4(), uuid.v4()).replace(/-/g, '')
    dbapi.saveUserAccessToken(req.user.email, {
        title: title
        , id: id
        , jwt: jwt
    })
        .then(function(stats) {
        req.options.pushdev.send([
            req.user.group
            , wireutil.envelope(new wire.UpdateAccessTokenMessage())
        ])
        apiutil.respond(res, 201, 'Created (access token)', {token: apiutil.publishAccessToken(stats.changes[0].new_val)})
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
    const id = req.path.id
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
