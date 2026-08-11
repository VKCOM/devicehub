import _ from 'lodash'
import {Adb} from '@u4/adbkit'
import dbapi from '../../../db/api.js'
import logger from '../../../util/logger.js'
import datautil from '../../../util/datautil.js'
import deviceutil from '../../../util/deviceutil.js'
import wireutil from '../../../wire/util.js'
import * as apiutil from '../../../util/apiutil.js'
import * as lockutil from '../../../util/lockutil.js'
import * as Sentry from '@sentry/node'
import generateToken from '../helpers/generateToken.js'
import {AdbKeysUpdatedMessage, ConnectStartMessage, ConnectStopMessage, GroupMessage, OwnerMessage, UpdateAccessTokenMessage, UngroupMessage} from '../../../wire/wire.js'
let log = logger.createLogger('api:controllers:user')

function getUser(req, res) {
    // delete req.user.groups.lock
    res.json({
        success: true,
        description: 'User information',
        user: req.user
    })
}

function getUserDevices(req, res) {
    const fields = req.query.fields
    log.info('Loading user devices')
    dbapi.loadUserDevices(req.user.email)
        .then(list => {
            log.info('Devices list from db - ' + list)
            let deviceList = []
            list.forEach(function(device) {
                datautil.normalize(device, req.user)

                /** @type {any} */
                let responseDevice = device
                if (fields) {
                    responseDevice = _.pick(device, fields.split(','))
                }
                deviceList.push(responseDevice)
            })
            log.info('Devices list after normalization - ' + deviceList)
            res.json({
                success: true,
                description: 'Information about controlled devices',
                devices: deviceList
            })
        })
        .catch(err => {
            log.error('Failed to load device list: ', err.stack)
            apiutil.respond(res, 500, 'Failed to load device list')
        })
}

function getUserDeviceBySerial(req, res) {
    const serial = req.params.serial
    const fields = req.query.fields
    return dbapi.loadDevice(req.user.groups.subscribed, serial)
        .then(function(device) {
            if (!device) {
                return res.status(404).json({
                    success: false,
                    description: 'Device not found'
                })
            }
            datautil.normalize(device, req.user)
            if (!deviceutil.isOwnedByUser(device, req.user)) {
                return res.status(403).json({
                    success: false,
                    description: 'Device is not owned by you'
                })
            }
            let responseDevice = device
            if (fields) {
                responseDevice = _.pick(device, fields.split(','))
            }
            res.json({
                success: true,
                description: 'Controlled device information',
                device: responseDevice
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
    return lockutil.lockGenericDevice(req, res, lock, dbapi.lockDeviceByCurrent)
        .then(async function(lockingSuccessed) {
            if (lockingSuccessed) {
                const device = lock.device
                datautil.normalize(device, req.user)
                if (!deviceutil.isAddable(device, req.user)) {
                    return res.status(403).json({
                        success: false,
                        description: 'Device is being used or not available'
                    })
                }
                const usage = 'automation'
                try {
                    await req.options.txmanager.runTransaction(
                        device.provider.name,
                        device.serial,
                        GroupMessage,
                        {
                            owner: OwnerMessage.create({
                                email: req.user.email,
                                name: req.user.name,
                                group: req.user.group
                            }),
                            requirements: wireutil.toDeviceRequirements({
                                serial: {value: serial, match: 'exact'}
                            }),
                            usage,
                            timeout: timeout || undefined,
                            keys: req.user.adbKeys.map(key => key.fingerprint)
                        }
                    )
                    log.info(device.serial + ' added to user group ' + req.user.email)
                    return res.json({
                        success: true,
                        description: 'Device successfully added'
                    })
                }
                catch (err) {
                    return apiutil.respond(res, 504, 'Device is not responding')
                }
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
    return dbapi.loadDevice(req.user.groups.subscribed, serial)
        .then(async function(device) {
            if (!device) {
                if (isInternal) {
                    return false
                }
                else {
                    return res.status(404).json({
                        success: false,
                        description: 'Device not found'
                    })
                }
            }
            datautil.normalize(device, req.user)
            if (!deviceutil.isOwnedByUser(device, req.user)) {
                Sentry.addBreadcrumb({
                    data: {device, user: req.user},
                    message: 'This device is not owned by this user.',
                    level: 'warning',
                    type: 'default'
                })
                if (isInternal) {
                    return false
                }
                else {
                    Sentry.captureMessage('403 someone tried to release somebody elses device')
                    return res.status(403).json({
                        success: false,
                        description: 'Releasing this device is not possible as it does not belong to you'
                    })
                }
            }

            await req.options.txmanager.runTransaction(
                device.provider.name,
                device.serial,
                UngroupMessage,
                {
                    requirements: wireutil.toDeviceRequirements({
                        serial: {value: serial, match: 'exact'}
                    })
                }
            )
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
                apiutil.respond(res, 500, 'Internal Server Error' + err.message ? `: ${err.message}` : '')
            }
        })
}

function remoteConnectUserDeviceBySerial(req, res) {
    let serial = req.params.serial
    return dbapi.loadDevice(req.user.groups.subscribed, serial)
        .then(async function(device) {
            if (!device) {
                return res.status(404).json({
                    success: false,
                    description: 'Device not found'
                })
            }
            datautil.normalize(device, req.user)
            if (!deviceutil.isOwnedByUser(device, req.user)) {
                return res.status(403).json({
                    success: false,
                    description: 'Device is not owned by you or is not available'
                })
            }
            try {
                const result = await req.options.txmanager.runTransaction(
                    device.provider.name,
                    device.serial,
                    ConnectStartMessage,
                    {}
                )
                return res.json({
                    success: true,
                    description: 'Remote connection is enabled',
                    remoteConnectUrl: result.data
                })
            }
            catch (err) {
                return apiutil.respond(res, 504, 'Device is not responding')
            }
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
    return dbapi.loadDevice(req.user.groups.subscribed, serial)
        .then(async function(device) {
            if (!device) {
                if (isInternal) {
                    return false
                }
                else {
                    return res.status(404).json({
                        success: false,
                        description: 'Device not found'
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
                        success: false,
                        description: 'Device is not owned by you or is not available'
                    })
                }
            }
            try {
                await req.options.txmanager.runTransaction(
                    device.provider.name,
                    device.serial,
                    ConnectStopMessage,
                    {}
                )
                if (isInternal) {
                    return true
                }
                return res.json({
                    success: true,
                    description: 'Device remote disconnected successfully'
                })
            }
            catch (err) {
                if (isInternal) {
                    return false
                }
                return apiutil.respond(res, 504, 'Device is not responding')
            }
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
            res.json({
                success: true,
                titles: list.map(token => token.title)
            })
        })
        .catch(function(err) {
            log.error('Failed to load tokens: ', err.stack)
            apiutil.respond(res, 500, 'Internal Server Error')
        })
}

async function addAdbPublicKey(req, res) {
    const data = req.body

    try {
    // Parse the public key
        const key = await Adb.util.parsePublicKey(data.publickey)

        // Look up users by fingerprint
        const adbKeys = await dbapi.lookupUsersByAdbKey(key.fingerprint)

        const responseData = {
            key: {
                title: data.title || key.comment,
                fingerprint: key.fingerprint
            },
            users: adbKeys
        }

        if (responseData.users.length) {
            res.json({
                success: true,
                fingerprint: responseData.key.fingerprint
            })
        }
        else {
            try {
                await dbapi.insertUserAdbKey(req.user.email, responseData.key)

                res.json({
                    success: true,
                    fingerprint: responseData.key.fingerprint
                })
            }
            catch (err) {
                if (err instanceof dbapi.DuplicateSecondaryIndexError) {
                    return res.status(208).json({
                        success: true,
                        message: 'Key was already added'
                    })
                }
                throw err // rethrow so it goes to the outer catch
            }
        }

        // Broadcast the update; the websocket unit fans it to interested clients.
        req.options.transport.sendBroadcast(wireutil.pack(AdbKeysUpdatedMessage, {}))

    }
    catch (err) {
        log.error('Failed to insert a new ADB key fingerprint: ', err.stack)
        return apiutil.respond(res, 500, 'Unable to insert the new ADB key fingerprint into the database')
    }
}


function removeAdbPublicKey(req, res) {
    const fingerprint = req.body.fingerprint
    dbapi.deleteUserAdbKey(req.user.email, fingerprint)
        .then(() => {
        // TODO: check that key was really deleted
            return res.status(200).json({
                success: true,
                message: 'Key with fingerprint ' + fingerprint + ' was deleted'
            })
        })
        .catch(() => {
            return apiutil.respond(res, 500, 'Unable to delete key from database')
        })
}

async function getAccessToken(req, res) {
    const id = req.params.id

    try {
        let token = await dbapi.loadAccessTokenByJwt(id).catch(() => null)
        if (!token) {
            token = await dbapi.loadAccessTokenById(id)
        }

        if (!token || token.email !== req.user.email) {
            return apiutil.respond(res, 404, 'Not Found (access token)')
        }

        apiutil.respond(res, 200, 'Access Token Information', {
            token: apiutil.publishAccessToken(token)
        })
    }
    catch (err) {
        apiutil.internalError(res, 'Failed to find access token by id "%s": ', id, err.stack)
    }
}

export function getAccessTokenByTitle(req, res) {
    const {title} = req.body
    if (!title) {
        apiutil.respond(res, 404, 'Not Found (access token)')
        return
    }
    dbapi.loadAccessTokenByTitle(req.user?.email || '', title).then(function(token) {
        if (!token) {
            apiutil.respond(res, 404, 'Not Found (access token)')
        }
        else {
            apiutil.respond(res, 200, 'Access Token Information', {
                token: apiutil.publishAccessToken(token)
            })
        }
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to find access token by title "%s": ', title, err.stack)
        })
}

function getAccessTokens(req, res) {
    dbapi.loadAccessTokens(req.user.email).then(async(tokens) => {
        const tokenList = []
        tokens.forEach(function(token) {
            tokenList.push(apiutil.publishAccessToken(token))
        })
        apiutil.respond(res, 200, 'Access Tokens Information', {tokens: tokenList})
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to get access tokens: ', err.stack)
        })
}

function createAccessToken(req, res) {
    const title = req.query.title
    const token = generateToken(req.user, req.options.secret)
    dbapi.saveUserAccessToken(req.user.email, {
        title: title,
        id: token.id,
        jwt: token.jwt
    })
        .then(function(tokenId) {
            req.options.transport.sendBroadcast(wireutil.pack(UpdateAccessTokenMessage, {}))
            apiutil.respond(res, 201, 'Created (access token)', {token: apiutil.publishAccessToken(token)})
        })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to create access token "%s": ', title, err.stack)
        })
}

function deleteAccessTokens(req, res) {
    dbapi.removeUserAccessTokens(req.user.email).then(function(stats) {
        // @ts-ignore
        if (!stats.deleted) {
            apiutil.respond(res, 200, 'Unchanged (access tokens)')
        }
        else {
            req.options.transport.sendBroadcast(wireutil.pack(UpdateAccessTokenMessage, {}))
            apiutil.respond(res, 200, 'Deleted (access tokens)')
        }
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to delete access tokens: ', err.stack)
        })
}

function deleteAccessToken(req, res) {
    const id = req.params.id
    dbapi.loadAccessTokenById(id).then(function(token) {
        if (!token || token.email !== req.user.email) {
            apiutil.respond(res, 404, 'Not Found (access token)')
        }
        else {
            dbapi.removeAccessToken(id).then(function(stats) {
                // @ts-ignore
                if (!stats.deleted) {
                    apiutil.respond(res, 404, 'Not Found (access token)')
                }
                else {
                    req.options.transport.sendBroadcast(wireutil.pack(UpdateAccessTokenMessage, {}))
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
    getUser: getUser,
    getUserDevices: getUserDevices,
    addUserDevice: addUserDevice,
    getUserDeviceBySerial: getUserDeviceBySerial,
    deleteUserDeviceBySerial: deleteUserDeviceBySerial,
    remoteConnectUserDeviceBySerial: remoteConnectUserDeviceBySerial,
    remoteDisconnectUserDeviceBySerial: remoteDisconnectUserDeviceBySerial,
    getUserAccessTokens: getUserAccessTokens,
    addAdbPublicKey: addAdbPublicKey,
    removeAdbPublicKey: removeAdbPublicKey,
    addUserDeviceV2: addUserDevice,
    getAccessTokens: getAccessTokens,
    getAccessToken: getAccessToken,
    getAccessTokenByTitle: getAccessTokenByTitle,
    createAccessToken: createAccessToken,
    deleteAccessToken: deleteAccessToken,
    deleteAccessTokens: deleteAccessTokens
}
