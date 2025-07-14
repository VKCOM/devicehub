import dbapi from '../../../db/api.js'
import _ from 'lodash'
import * as apiutil from '../../../util/apiutil.js'
import * as lockutil from '../../../util/lockutil.js'
import Promise from 'bluebird'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import userapi from './user.js'
import * as service from '../../../util/serviceuser.js'
import {MongoServerError} from 'mongodb'

/* --------------------------------- PRIVATE FUNCTIONS --------------------------------------- */
function userApiWrapper(fn, req, res) {
    const email = req.params.email
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
function getPublishedUser(user, userEmail, adminEmail, fields) {
    let publishedUser = apiutil.publishUser(user)
    if (userEmail !== adminEmail) {
        publishedUser = _.pick(user, 'email', 'name', 'privilege', 'groups.quotas')
    }
    if (fields) {
        publishedUser = _.pick(publishedUser, fields.split(','))
    }
    return publishedUser
}
function removeUser(email, req, res) {
    const groupOwnerState = req.query.groupOwner
    const anyGroupOwnerState = typeof groupOwnerState === 'undefined'
    const lock = {}
    function removeGroupUser(owner, id) {
        return dbapi.getUserGroup(owner, id).then(function(group) {
            if (!group) {
                return 'not found'
            }
            return owner === email ?
                dbapi.deleteUserGroup(id) :
                dbapi.removeGroupUser(id, email)
        })
    }
    function deleteUserInDatabase(channel) {
        return dbapi.removeUserAccessTokens(email).then(function() {
            return dbapi.deleteUser(email).then(function() {
                req.options.pushdev.send([
                    channel,
                    wireutil.envelope(new wire.DeleteUserMessage(email))
                ])
                return 'deleted'
            })
        })
    }
    function computeUserGroupOwnership(groups) {
        if (anyGroupOwnerState) {
            return Promise.resolve(true)
        }
        return Promise.map(groups, function(group) {
            if (!groupOwnerState && group.owner.email === email) {
                return Promise.reject('filtered')
            }
            return !groupOwnerState || group.owner.email === email
        })
            .then(function(results) {
                return _.without(results, false).length > 0
            })
            .catch(function(err) {
                if (err === 'filtered') {
                    return false
                }
                throw err
            })
    }
    if (req.user.email === email) {
        return Promise.resolve('forbidden')
    }
    return dbapi.lockUser(email).then(function(stats) {
        if (stats.modifiedCount === 0) {
            return apiutil.lightComputeStats(res, stats)
        }
        const user = lock.user = stats.changes[0].new_val
        return dbapi.getGroupsByUser(user.email).then(function(groups) {
            return computeUserGroupOwnership(groups).then(function(doContinue) {
                if (!doContinue) {
                    return 'unchanged'
                }
                return Promise.each(groups || [], function(group) {
                    return removeGroupUser(group.owner.email, group.id)
                })
                    .then(function() {
                        return deleteUserInDatabase(user.group)
                    })
            })
        })
    })
        .finally(function() {
            // lockutil.unlockUser(lock)
        })
}
function grantAdmin(req, res) {
    if (req.user.privilege !== apiutil.ADMIN) {
        return apiutil.respond(res, 403, 'Forbidden (user doesnt have admin privilege)')
    }
    dbapi.grantAdmin(req.params.email).then((user) => {
        if (user) {
            // @ts-ignore
            return apiutil.respond(res, 200, 'Grant admin for user', {user: user})
        }
        else {
            apiutil.respond(res, 404, 'Not Found (user)')
        }
    })
}
function revokeAdmin(req, res) {
    if (req.user.privilege !== apiutil.ADMIN) {
        return apiutil.respond(res, 403, 'Forbidden (user doesnt have admin privilege)')
    }
    dbapi.revokeAdmin(req.params.email).then((user) => {
        if (user) {
            // @ts-ignore
            return apiutil.respond(res, 200, 'Revoke admin for user', {user: user})
        }
        else {
            apiutil.respond(res, 404, 'Not Found (user)')
        }
    })
}
function lockStfAdminUser(res) {
    const lock = {}
    dbapi.lockUser(apiutil.STF_ADMIN_EMAIL).then(function(stats) {
        if (stats.modifiedCount === 0) {
            return apiutil.lightComputeStats(res, stats)
        }
        lock.user = stats.changes[0].new_val
    })
    return lock
}
function updateUsersAlertMessage(req, res) {
    if (req.user.privilege !== apiutil.ADMIN) {
        return apiutil.respond(res, 403, 'Forbidden (user doesnt have admin privilege)')
    }
    const lock = lockStfAdminUser(res)
    return dbapi.updateUsersAlertMessage(req.body).then(function(/** @type {any} */ stats) {
        if (stats.matchedCount > 0 && stats.modifiedCount === 0) {
            apiutil.respond(res, 200, 'Unchanged (users alert message)', {alertMessage: stats.changes[0].new_val.settings.alertMessage})
        }
        else {
            apiutil.respond(res, 200, 'Updated (users alert message)', {alertMessage: stats.changes[0].new_val.settings.alertMessage})
        }
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to update users alert message: ', err.stack)
        })
        .catch(function(err) {
            if (err !== 'busy') {
                throw err
            }
        })
        .finally(function() {
            lockutil.unlockUser(lock)
        })
}

/* --------------------------------- PUBLIC FUNCTIONS --------------------------------------- */
function getUserInfo(req, email) {
    const fields = req.query.fields
    return dbapi.loadUser(email).then(function(user) {
        if (user) {
            return dbapi.getRootGroup().then(function(group) {
                return getPublishedUser(user, req.user.email, group?.owner?.email, fields)
            })
        }
        return false
    })
}
function getUsersAlertMessage(req, res) {
    const fields = req.query.fields
    return dbapi.loadUser(apiutil.STF_ADMIN_EMAIL).then(function(user) {
        if (user?.settings?.alertMessage === undefined) {
            const lock = lockStfAdminUser(res)
            const alertMessage = {
                activation: 'False',
                data: '*** this site is currently under maintenance, please wait ***',
                level: 'Critical'
            }
            return dbapi.updateUsersAlertMessage(alertMessage).then(function(/** @type {any} */ stats) {
                if (!stats.errors) {
                    return stats.changes[0].new_val.settings.alertMessage
                }
                throw new Error('Failed to initialize users alert message')
            })
                .finally(function() {
                    lockutil.unlockUser(lock)
                })
        }
        return user?.settings?.alertMessage
    })
        .then(function(alertMessage) {
            if (fields) {
                return _.pick(alertMessage, fields.split(','))
            }
            else {
                return alertMessage
            }
        })
        .then(function(alertMessage) {
            apiutil.respond(res, 200, 'Users Alert Message', {alertMessage: alertMessage})
        })
        .catch(function(err) {
            if (err !== 'busy') {
                apiutil.internalError(res, 'Failed to get users alert message: ', err.stack)
            }
        })
}
function updateUserGroupsQuotas(req, res) {
    const email = req.params.email
    const duration = typeof req.query.duration !== 'undefined' ?
        req.query.duration :
        null
    const number = typeof req.query.number !== 'undefined' ?
        req.query.number :
        null
    const repetitions = typeof req.query.repetitions !== 'undefined' ?
        req.query.repetitions :
        null
    const lock = {}

    dbapi.loadUser(email).then(function(user) {
        if (user) {
            lockutil.lockUser(email, res, lock).then(function(lockingSuccessed) {
                if (lockingSuccessed) {
                    return dbapi.updateUserGroupsQuotas(email, duration, number, repetitions)
                        .then(function(/** @type {any} */ stats) {
                            if (stats.modifiedCount > 0) {
                                return apiutil.respond(res, 200, 'Updated (user quotas)', {
                                    user: apiutil.publishUser(stats.changes[0].new_val)
                                })
                            }
                            if ((duration === null || duration === lock.user.groups.quotas.allocated.duration) &&
                                (number === null || number === lock.user.groups.quotas.allocated.number) &&
                                (repetitions === null || repetitions === lock.user.groups.quotas.repetitions)) {
                                return apiutil.respond(res, 200, 'Unchanged (user quotas)', {user: {}})
                            }
                            return apiutil.respond(res, 400, 'Bad Request (quotas must be >= actual consumed resources)')
                        })
                }
                return false
            })
                .catch(function(err) {
                    apiutil.internalError(res, 'Failed to update user groups quotas: ', err.stack)
                })
                .finally(function() {
                    lockutil.unlockUser(lock)
                })
        }
        else {
            apiutil.respond(res, 404, 'Unknown user')
        }
    })
}
function updateDefaultUserGroupsQuotas(req, res) {
    const duration = typeof req.query.duration !== 'undefined' ?
        req.query.duration :
        null
    const number = typeof req.query.number !== 'undefined' ?
        req.query.number :
        null
    const repetitions = typeof req.query.repetitions !== 'undefined' ?
        req.query.repetitions :
        null
    const lock = {}
    lockutil.lockUser(req.user.email, res, lock).then(function(lockingSuccessed) {
        if (lockingSuccessed) {
            return dbapi.updateDefaultUserGroupsQuotas(req.user.email, duration, number, repetitions)
                .then(function(/** @type {any} */ stats) {
                    if (stats.modifiedCount > 0) {
                        return apiutil.respond(res, 200, 'Updated (user default quotas)', {
                            user: apiutil.publishUser(stats)
                        })
                    }
                    return apiutil.respond(res, 200, 'Unchanged (user default quotas)', {user: {}})
                })
        }
        return false
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to update default user groups quotas: ', err.stack)
        })
        .finally(function() {
            lockutil.unlockUser(lock)
        })
}
function getUserByEmail(req, res) {
    const email = req.params.email
    getUserInfo(req, email).then(function(user) {
        if (user) {
            apiutil.respond(res, 200, 'User Information', {user: user})
        }
        else {
            apiutil.respond(res, 404, 'Not Found (user)')
        }
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to get user: ', err.stack)
        })
}
function getUsers(req, res) {
    const fields = req.query.fields
    dbapi.getUsers().then(function(users) {
        return dbapi.getRootGroup().then(function(group) {
            apiutil.respond(res, 200, 'Users Information', {
                users: users.map(function(user) {
                    return getPublishedUser(user, req.user.email, group?.owner?.email, fields)
                })
            })
        })
    })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to get users: ', err.stack)
        })
}
function createUser(req, res) {
    const email = req.params.email
    const name = req.query.name
    dbapi.createUser(email, name, req.user.ip).then(function(/** @type {any} */ stats) {
        apiutil.respond(res, 201, 'Created (user)', {
            user: apiutil.publishUser(stats.changes[0].new_val)
        })
    })
        .catch(function(err) {
            if (err instanceof MongoServerError && err.message.includes('duplicate key error collection')) {
                return apiutil.respond(res, 400, 'Bad request (user already exists)')
            }
            else {
                return apiutil.internalError(res, 'Failed to create user: ', err.stack)
            }
        })
}
function createServiceUser(req, res) {
    if (req.user.privilege !== apiutil.ADMIN) {
        apiutil.respond(res, 403, 'Forbidden (user doesnt have admin privilege)')
        return
    }
    const email = req.params.email
    const name = req.query.name
    const secret = req.query.secret
    const admin = req.query.admin
    service.generate(email, name, admin, secret).then(function(serviceUserInfo) {
        return apiutil.respond(res, 201, 'Created (service user)', {
            serviceUserInfo: apiutil.publishUser(serviceUserInfo)
        })
    }).catch(function(err) {
        if (err instanceof MongoServerError && err.message.includes('duplicate key error collection')) {
            return apiutil.respond(res, 400, 'Bad request (user already exists)')
        }
        else {
            return apiutil.internalError(res, 'Failed to create service user: ', err.stack)
        }
    })
}
function deleteUsers(req, res) {
    const emails = apiutil.getBodyParameter(req.body, 'emails')
    const target = apiutil.getQueryParameter(req.query.redirected) ? 'user' : 'users'
    function removeUsers(emails) {
        let results = []
        return Promise.each(emails, function(email) {
            return removeUser(email, req, res).then(function(result) {
                results.push(result)
            })
        })
            .then(function() {
                results = _.without(results, 'unchanged')
                if (!results.length) {
                    return apiutil.respond(res, 200, `Unchanged (${target})`)
                }
                results = _.without(results, 'not found')
                if (!results.length) {
                    return apiutil.respond(res, 404, `Not Found (${target})`)
                }
                results = _.without(results, 'forbidden')
                if (!results.length) {
                    apiutil.respond(res, 403, `Forbidden (${target})`)
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
        if (typeof emails === 'undefined') {
            return dbapi.getEmails().then(function(emails) {
                return removeUsers(emails)
            })
        }
        else {
            return removeUsers(_.without(emails.split(','), ''))
        }
    })()
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to delete ${target}: ', err.stack)
        })
}
function deleteUser(req, res) {
    apiutil.redirectApiWrapper('email', deleteUsers, req, res)
}
function createUserAccessToken(req, res) {
    userApiWrapper(userapi.createAccessToken, req, res)
}
function deleteUserAccessToken(req, res) {
    userApiWrapper(userapi.deleteAccessToken, req, res)
}
function deleteUserAccessTokens(req, res) {
    userApiWrapper(userapi.deleteAccessTokens, req, res)
}
function getUserAccessToken(req, res) {
    userApiWrapper(userapi.getAccessToken, req, res)
}
function getUserAccessTokens(req, res) {
    userApiWrapper(userapi.getUserAccessTokens, req, res)
}
function getUserDevices(req, res) {
    userApiWrapper(userapi.getUserDevices, req, res)
}
function getUserDevice(req, res) {
    userApiWrapper(userapi.getUserDeviceBySerial, req, res)
}
function addUserDevice(req, res) {
    userApiWrapper(userapi.addUserDevice, req, res)
}
function deleteUserDevice(req, res) {
    userApiWrapper(userapi.deleteUserDeviceBySerial, req, res)
}
function remoteConnectUserDevice(req, res) {
    userApiWrapper(userapi.remoteConnectUserDeviceBySerial, req, res)
}
function remoteDisconnectUserDevice(req, res) {
    userApiWrapper(userapi.remoteDisconnectUserDeviceBySerial, req, res)
}
function deleteUserDeviceBySerial(req, res) {
    userApiWrapper(userapi.deleteUserDeviceBySerial, req, res)
}
export {updateUserGroupsQuotas}
export {updateDefaultUserGroupsQuotas}
export {getUsers}
export {getUsersAlertMessage}
export {updateUsersAlertMessage}
export {getUserByEmail}
export {getUserInfo}
export {createUser}
export {createServiceUser}
export {deleteUser}
export {deleteUsers}
export {createUserAccessToken}
export {deleteUserAccessToken}
export {deleteUserAccessTokens}
export {getUserAccessTokens as getUserAccessTokensV2}
export {getUserAccessToken}
export {getUserDevices as getUserDevicesV2}
export {getUserDevice}
export {addUserDevice as addUserDeviceV3}
export {deleteUserDevice}
export {remoteConnectUserDevice}
export {remoteDisconnectUserDevice}
export {grantAdmin}
export {revokeAdmin}
export {deleteUserDeviceBySerial}
export default {
    updateUserGroupsQuotas: updateUserGroupsQuotas,
    updateDefaultUserGroupsQuotas: updateDefaultUserGroupsQuotas,
    getUsers: getUsers,
    getUsersAlertMessage: getUsersAlertMessage,
    updateUsersAlertMessage: updateUsersAlertMessage,
    getUserByEmail: getUserByEmail,
    getUserInfo: getUserInfo,
    createUser: createUser,
    createServiceUser: createServiceUser,
    deleteUser: deleteUser,
    deleteUsers: deleteUsers,
    createUserAccessToken: createUserAccessToken,
    deleteUserAccessToken: deleteUserAccessToken,
    deleteUserAccessTokens: deleteUserAccessTokens,
    getUserAccessTokensV2: getUserAccessTokens,
    getUserAccessToken: getUserAccessToken,
    getUserDevicesV2: getUserDevices,
    getUserDevice: getUserDevice,
    addUserDeviceV3: addUserDevice,
    deleteUserDevice: deleteUserDevice,
    remoteConnectUserDevice: remoteConnectUserDevice,
    remoteDisconnectUserDevice: remoteDisconnectUserDevice,
    grantAdmin: grantAdmin,
    revokeAdmin: revokeAdmin,
    deleteUserDeviceBySerial: deleteUserDeviceBySerial
}
