/* *
 * Copyright 2025 contains code contributed by V Kontakte LLC - Licensed under the Apache license 2.0
 * */
import db from '../../index.js'
import * as apiutil from '../../../util/apiutil.js'
import logger from '../../../util/logger.js'

import AllModel from '../all/index.js'
import GroupModel from '../group/index.js'
import wireutil from '../../../wire/util.js'
import UserChangeHandler from '../../handlers/user/index.js'

const log = logger.createLogger('dbapi:user')

/*
===========================================================
==================== without change DB ====================
===========================================================
*/

// dbapi.getUsers = function() {
export const getUsers = function() {
    return db.users.find().toArray()
}

// dbapi.loadUser = function(email) {
export const loadUser = function(email) {
    return db.users.findOne({email: email})
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

/*
====================================================================
==================== changing DB - use handlers ====================
====================================================================
*/

// dbapi.createUser = function(email, name, ip) {
export const createUser = async(email, name, ip, privilege) => {
    const rootGroup = await GroupModel.getRootGroup()
    const adminUser = await loadUser(rootGroup?.owner.email)
    let userObj = {
        email: email,
        name: name,
        ip: ip,
        group: wireutil.makePrivateChannel(),
        lastLoggedInAt: AllModel.getNow(),
        createdAt: AllModel.getNow(),
        forwards: [],
        settings: {},
        acceptedPolicy: false,
        privilege: privilege || (adminUser ? apiutil.USER : apiutil.ADMIN),
        groups: {
            subscribed: [],
            lock: false,
            quotas: {
                allocated: {
                    number: adminUser ? adminUser.groups.quotas.defaultGroupsNumber : rootGroup?.envUserGroupsNumber,
                    duration: adminUser ? adminUser.groups.quotas.defaultGroupsDuration : rootGroup?.envUserGroupsDuration
                },
                consumed: {
                    number: 0,
                    duration: 0
                },
                defaultGroupsNumber: adminUser ? 0 : rootGroup?.envUserGroupsNumber,
                defaultGroupsDuration: adminUser ? 0 : rootGroup?.envUserGroupsDuration,
                defaultGroupsRepetitions: adminUser ? 0 : rootGroup?.envUserGroupsRepetitions,
                repetitions: adminUser ? adminUser.groups.quotas.defaultGroupsRepetitions : rootGroup?.envUserGroupsRepetitions
            }
        }
    }
    const stats = await db.users.insertOne(userObj)
    if (stats.insertedId) {
        UserChangeHandler.sendUserChange(userObj, false, [], 'created', ['settings'])

        await GroupModel.addGroupUser(rootGroup?.id, email)
        const newUser = await loadUser(email)

        // @ts-ignore
        stats.changes = [
            {new_val: {...newUser}}
        ]
    }
    return stats
}


// dbapi.saveUserAfterLogin = function(user) {
export const saveUserAfterLogin = function(user) {
    const updateData = {
        name: user?.name,
        ip: user?.ip,
        lastLoggedInAt: AllModel.getNow()
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

// dbapi.updateUsersAlertMessage = function(alertMessage) {
export const updateUsersAlertMessage = async function (alertMessage) {
    const oldUser = await db.users.findOne({email: apiutil.STF_ADMIN_EMAIL})
    const newUser = await db.users.findOneAndUpdate(
        {
            email: apiutil.STF_ADMIN_EMAIL
        }
        , {
            $set: Object.fromEntries(Object.entries(alertMessage).map(([key, value]) =>
                ['settings.alertMessage.' + key, value]
            )),
        },
        {returnDocument: 'after'}
    )

    var userModifided = false
    const userMatching = oldUser !== null
    if (newUser) {
        userModifided = UserChangeHandler.updateUserHandler(oldUser, newUser)
    }
    return {modifiedCount: userModifided ? 1 : 0, matchedCount: userMatching ? 1 : 0, newUser: newUser}
}


// dbapi.updateUserSettings = function(email, changes) {
export const updateUserSettings = async function(email, changes) {
    const oldUser = await db.users.findOne({email: email})
    const newUser = await db.users.findOneAndUpdate(
        {
            email: email
        }
        , {
            $set: {
                settings: {...oldUser?.settings, ...changes}
            }
        },
        {returnDocument: 'after'}
    )
    UserChangeHandler.updateUserHandler(oldUser, newUser)
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

export const reserveUserGroupInstance = async(email) => {
    const oldUser = await loadUser(email)
    const newUser = await db.users.findOneAndUpdate(
        {email}
        , [{
            $set: {'groups.quotas.consumed.number': {
                $min: [{
                    $sum: ['$groups.quotas.consumed.number', 1]
                }, '$groups.quotas.allocated.number']}
            }
        }],
        {returnDocument: 'after'}
    )
    const userModifided = UserChangeHandler.updateUserHandler(oldUser, newUser)
    return {modifiedCount: userModifided ? 1 : 0}
}

export const releaseUserGroupInstance = async(email) => {
    const oldUser = await loadUser(email)
    const newUser = await db.users.findOneAndUpdate(
        {
            email
        }
        , [{
            $set: {'groups.quotas.consumed.number': {
                $max: [{
                    $sum: ['$groups.quotas.consumed.number', -1]
                }, 0]}
            }
        }],
        {returnDocument: 'after'}
    )
    const userModifided = UserChangeHandler.updateUserHandler(oldUser, newUser)
    return {modifiedCount: userModifided ? 1 : 0}
}

export const updateUserGroupDuration = async(email, oldDuration, newDuration) => {
    const oldUser = await loadUser(email)
    const newUser = await db.users.findOneAndUpdate(
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
        }],
        {returnDocument: 'after'}
    )
    var userModifided = false
    const userMatching = oldUser !== null
    if (newUser) {
        userModifided = UserChangeHandler.updateUserHandler(oldUser, newUser)
    }
    return {modifiedCount: userModifided ? 1 : 0, matchedCount: userMatching ? 1 : 0}
}

export const updateUserGroupsQuotas = async(email, duration, number, repetitions) => {
    const oldUser = await db.users.findOne({email: email})

    const consumed = oldUser?.groups.quotas.consumed.duration
    const allocated = oldUser?.groups.quotas.allocated.duration
    const consumedNumber = oldUser?.groups.quotas.consumed.number
    const allocatedNumber = oldUser?.groups.quotas.allocated.number

    const newUser = await db.users.findOneAndUpdate(
        {email: email}
        , {
            $set: {
                'groups.quotas.allocated.duration': duration && consumed <= duration &&
                (!number || consumedNumber <= number) ? duration : allocated,
                'groups.quotas.allocated.number': number && consumedNumber <= number &&
                (!duration || consumed <= duration) ? number : allocatedNumber,
                'groups.quotas.repetitions': repetitions || oldUser?.groups.quotas.repetitions
            }
        },
        {returnDocument: 'after'}
    )

    var userModifided = false
    if (newUser) {
        userModifided = UserChangeHandler.updateUserHandler(oldUser, newUser)
    }

    return {modifiedCount: userModifided ? 1 : 0, newUser: newUser}
}

export const updateDefaultUserGroupsQuotas = async(email, duration, number, repetitions) => {
    const oldUser = await db.users.findOne({email: email})
    const newUser = await db.users.findOneAndUpdate(
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
        }],
        {returnDocument: 'after'}
    )
    var userModifided = false
    if (newUser) {
        userModifided = UserChangeHandler.updateUserHandler(oldUser, newUser)
    }
    return {modifiedCount: userModifided ? 1 : 0, newUser: newUser}
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

// dbapi.resetUserSettings = function(email) {
export const resetUserSettings = function(email) {
    return db.users.updateOne({email: email},
        {
            $set: {
                settings: {}
            }
        })
}

export const deleteUser = async function(email) {
    const deletedUser = await db.users.findOneAndDelete({email: email})
    UserChangeHandler.sendUserChange(deletedUser, false, [], 'deleted', ['settings'])
    return {deletedCount: deletedUser !== null ? 1 : 0}
}


/*
====================================================
==================== deprecated ====================
====================================================
*/

/**
 * @deprecated Do not use locks in database.
 */
export const setLockOnUser = function(email, state) {
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
