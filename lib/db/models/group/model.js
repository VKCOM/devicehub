/* *
 * Copyright © 2025 contains code contributed by V Kontakte LLC - Licensed under the Apache license 2.0
 * */

import {v4 as uuidv4} from 'uuid'
import db from '../../index.js'
import * as apiutil from '../../../util/apiutil.js'
import logger from '../../../util/logger.js'
import AllModel from '../all/index.js'
import _ from 'lodash'
import util from 'util'
import GroupChangeHandler from '../../handlers/group/index.js'
import {isOriginGroup} from '../../../util/apiutil.js'

import mongo from 'mongodb'

const log = logger.createLogger('dbapi:group')

/** @returns {Promise<Array<mongo.WithId<mongo.Document>> | null>} */
export const getReadyGroupsOrderByIndex = async(index) => {
    return db.groups.find({
        state: {
            $ne: apiutil.PENDING
        }
    }, {sort: [index]}).toArray()
}

/** @returns {Promise<Array<mongo.WithId<mongo.Document>> | null>} */
export const getGroupsByIndex = async(value, index) => {
    return db.groups.find({[index]: value}).toArray()
}


/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const getGroupByIndex = async(value, index) => {
    const groups = await getGroupsByIndex(value, index)
    return (groups || [])[0] || null
}

/** @returns {Promise<Array<mongo.WithId<mongo.Document>> | null>} */
export const getGroupsByUser = async(email) => {
    return db.groups.find({users: {$in: [email]}}).toArray()
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const getGroup = async(id) => {
    return db.groups.findOne({id: id})
}

/** @returns {Promise<Array<mongo.WithId<mongo.Document>> | null>} */
export const getGroups = async(filter) => {
    return db.groups.find(filter).toArray()
}

export const addGroupUser = async(id, email) => {
    try {
        const stats = await Promise.all([
            db.groups.findOneAndUpdate(
                {
                    id: id
                },
                {
                    $addToSet: {
                        users: email
                    }
                },
                {returnDocument: 'before'}
            )
            , db.users.updateOne(
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

        if (stats[0]?.id) {
            GroupChangeHandler.sendGroupChange(stats[0], stats[0].users.concat([email]), false, false, true, [email], false, [], 'updated')
            GroupChangeHandler.treatGroupUsersChange(stats[0], [email], stats[0].isActive, true)
        }

        return stats[0] && stats[1].modifiedCount === 0 ? 'unchanged ' + email : 'added ' + email
    }
    catch (err) {
        if (err instanceof TypeError) {
            log.error('User with email ' + email + " doesn't exist")
            return 'User with email ' + email + " doesn't exist"
        }

        return 'unchanged ' + email
    }
}

export const addAdminsToGroup = async(id) => {
    const admins = await AllModel.getAdmins()
    const group = await db.groups.findOne({id: id})

    const adminsEmails = Array.from(
        // @ts-ignore
        admins.reduce((set, a) => !group?.users?.includes(a.email) ? set.add(a.email) : set, new Set())
    )

    const newUsers = (group?.users || []).concat(adminsEmails)

    await Promise.all(
        adminsEmails.map(
            email => db.users.findOne({email})
                .then(user => db.users.updateOne(
                    {email},
                    {
                        $set: {
                            'groups.subscribed': (user?.groups?.subscribed || []).concat([id])
                        }
                    }
                ))
        )
    )


    const stats = await db.groups.updateOne(
        {
            id: id
        },
        {
            $set: {
                users: newUsers
            }
        }
    )

    GroupChangeHandler.sendGroupChange(group, newUsers, false, false, true, adminsEmails, false, [], 'updated')
    GroupChangeHandler.treatGroupUsersChange(group, newUsers, group?.isActive, true)

    return stats
}

export const removeGroupUser = async(id, email) => {
    const [group] = await Promise.all([
        db.groups.findOneAndUpdate(
            {id: id}
            , {
                $pull: {
                    users: email
                    , moderators: email
                }
            }
            , {returnDocument: 'after'}
        )
        , db.users.updateOne(
            {email: email}
            , {
                $pull: {'groups.subscribed': id}
            }
        )
    ])

    GroupChangeHandler.sendGroupChange(group, group?.users, false, false, false, [email], false, [], 'updated')
    GroupChangeHandler.treatGroupUsersChange(group, [email], group?.isActive, false)

    return 'deleted'
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const addOriginGroupDevice = async(group, serial) => {
    const newGroup = await db.groups.findOneAndUpdate(
        {id: group.id}
        , {$addToSet: {devices: serial}}
        , {returnDocument: 'after'}
    )

    GroupChangeHandler.sendGroupChange(newGroup, newGroup?.users, false, false, false, [], true, [serial], 'updated')
    GroupChangeHandler.treatGroupDevicesChange(group, newGroup, [serial], true)

    return newGroup
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const removeOriginGroupDevice = async(group, serial) => {
    const newGroup = await db.groups.findOneAndUpdate(
        {id: group.id}
        , [
            {
                $set: {devices: {$setDifference: ['$devices', [serial]]}}
            }
        ]
        , {returnDocument: 'after'}
    )

    GroupChangeHandler.sendGroupChange(newGroup, newGroup?.users, false, false, false, [], false, [serial], 'updated')
    GroupChangeHandler.treatGroupDevicesChange(group, newGroup, [serial], false)

    return newGroup
}

export const checkDatesOverlaps = (group, groups) => {
    const targetDates = group.dates

    for (let i = 0; i < groups.length; i++) {
        const currentDates = groups[i].dates

        for (let j = 0; j < targetDates.length; j++) {
            const {start: tStart, stop: tStop} = targetDates[j]

            for (let k = 0; k < currentDates.length; k++) {
                const {start: cStart, stop: cStop} = currentDates[k]

                if (tStart.getTime() < cStop.getTime() &&
                    cStart.getTime() < tStop.getTime()) {
                    return groups[i]
                }
            }
        }
    }

    return false
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const addGroupDevices = async(group, serials) => {
    if (!serials?.length) {
        return group
    }

    const duration = apiutil.computeDuration(group, serials.length)
    const stats = await AllModel.updateUserGroupDuration(group.owner.email, group.duration, duration)
    if (!stats.modifiedCount) {
        throw 'quota is reached'
    }

    const groups = await db.groups.find({
        class: {
            $nin: [apiutil.BOOKABLE, apiutil.STANDARD]
        }
        , devices: {
            $in: serials
        }
    }).toArray()


    if (checkDatesOverlaps(group, groups)) {
        throw 'dates overlap'
    }

    const newDevices = _.union(group.devices, serials)

    const newGroup = await db.groups.findOneAndUpdate(
        {id: group.id}
        , {
            $set: {
                duration: duration
                , devices: newDevices
            }
        }
        , {returnDocument: 'after'}
    )

    GroupChangeHandler.sendGroupChange(newGroup, newGroup?.users, false, false, false, [], true, _.xor(newDevices, group.devices), 'updated')
    GroupChangeHandler.treatGroupDevicesChange(group, newGroup, serials, true)

    return newGroup
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const removeGroupDevices = async(group, serials) => {
    const duration = apiutil.computeDuration(group, -serials.length)
    await AllModel.updateUserGroupDuration(group.owner.email, group.duration, duration)

    const newGroup = await db.groups.findOneAndUpdate(
        {id: group.id}
        , {
            $set: {
                duration: duration
                , devices: _.difference(group.devices, serials)
            }
        }
        , {returnDocument: 'after'}
    )

    GroupChangeHandler.sendGroupChange(newGroup, newGroup?.users, false, false, false, [], false, serials, 'updated')
    GroupChangeHandler.treatGroupDevicesChange(group, newGroup, serials, false)

    return newGroup
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const getRootGroup = async() => {
    const group = await getGroupByIndex(apiutil.ROOT, 'privilege')
    if (!group) {
        throw new Error('Root group not found')
    }
    return group
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const getUserGroup = async(email, id) => {
    const groups = await db.groups.find({
        $or: [
            {users: {$in: [email]}}
            , {moderators: {$in: [email]}}
            , {'owner.email': email}
        ]
        , id: id
    }).toArray()

    return (groups || [])[0] || null
}

/** @returns {Promise<Array<mongo.WithId<mongo.Document>> | null>} */
export const getUserGroups = async(email) => {
    const pipeline = {users: {$in: [email]}}

    const admins = await AllModel.getAdmins()
    const adminEmails = admins.map(admin => admin.email)

    if (!adminEmails.includes(email)) {
        pipeline.name = {$ne: 'Common'}
    }

    return await db.groups.find(pipeline).toArray()
}

/** @returns {Promise<Array<mongo.WithId<mongo.Document>> | null>} */
export const getOnlyUserGroups = async(email) => {
    return db.groups.find({
        users: {$in: [email]}
        , 'owner.email': {$ne: email}
    }).toArray()
}

/** @returns {Promise<Array<mongo.WithId<mongo.Document>> | null>} */
export const getTransientGroups = async() => {
    return db.groups.find({
        class: {
            $nin: [apiutil.BOOKABLE, apiutil.STANDARD]
        }
    }).toArray()
}

/** @returns {Promise<Array<mongo.WithId<mongo.Document>> | null>} */
export const getDeviceTransientGroups = async(serial) => {
    return db.groups.find({
        devices: serial
        , class: {$nin: [apiutil.BOOKABLE, apiutil.STANDARD]}
    }
    ).toArray()
}

/** @returns {Promise<boolean>} */
export const isRemoveGroupUserAllowed = async(email, targetGroup) => {
    if (targetGroup.class !== apiutil.BOOKABLE) {
        return true
    }

    const groups = await db.groups.aggregate([
        {
            $match: {
                'owner.email': email
                , class: {$nin: [apiutil.BOOKABLE, apiutil.STANDARD]}
                , $expr: {
                    $gt: [
                        {$size: {$setIntersection: ['$devices', targetGroup.devices]}}
                        , 0
                    ]
                }
            }
        }
    ]).toArray()

    return groups?.length === 0
}

/** @returns {Promise<boolean>} */
export const isUpdateDeviceOriginGroupAllowed = async(serial, targetGroup) => {
    const groups = await getDeviceTransientGroups(serial)
    if (!groups?.length) {
        return true
    }

    if (targetGroup.class === apiutil.STANDARD) {
        return false
    }

    return !groups?.some(group => targetGroup.users.includes(group.owner.email))
}

/** @returns {Promise<Array<mongo.WithId<mongo.Document>> | null>} */
export const getDeviceGroups = async(serial) => {
    return db.groups.find({
        devices: {$in: [serial]}
    }
    ).toArray()
}

/** @returns {Promise<mongo.WithId<mongo.Document> | false>} */
export const getGroupAsOwnerOrAdmin = async(email, id) => {
    const group = await getGroup(id)
    if (!group) {
        return false
    }

    if (email === group.owner.email) {
        return group
    }

    const user = await AllModel.loadUser(email)
    if (user && user.privilege === apiutil.ADMIN) {
        return group
    }

    return false
}

export const getOwnerGroups = async(email) => {
    const group = await getRootGroup()
    if (email === group?.owner?.email) {
        return getGroups()
    }
    return getGroupsByIndex(email, 'owner')
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const createGroup = async(data) => {
    const id = util.format('%s', uuidv4()).replace(/-/g, '')
    await db.groups.insertOne(Object.assign(data, {
        id: id
        , users: _.union(data.users, [data.owner.email])
        , devices: []
        , moderators: data.moderators || []
        , createdAt: AllModel.getNow()
        , lock: {
            user: false
            , admin: false
        }
        , ticket: null
        , runUrl: data.runUrl
    }))

    const newGroup = await getGroup(id)

    GroupChangeHandler.sendGroupChange(newGroup, newGroup?.users, false, false, false, [], false, [], 'created')
    GroupChangeHandler.sendGroupUsersChange(newGroup, newGroup?.users, [], true, 'GroupCreated')

    return newGroup
}

/** @returns {Promise<mongo.WithId<mongo.Document> | boolean | null>} */
export const createUserGroup = async(data) => {
    const stats = await AllModel.reserveUserGroupInstance(data.owner.email)
    if (!stats.modifiedCount) {
        log.info(`Could not reserve group for user ${data.owner.email}`)
        return false
    }

    const rootGroup = await getRootGroup()
    data.users = [rootGroup?.owner?.email]

    const group = await createGroup(data)
    await Promise.all([
        addGroupUser(group?.id, group?.owner?.email)
        , addGroupUser(group?.id, rootGroup?.owner?.email)
    ])

    return getGroup(group?.id)
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const updateGroupName = async(id, name) => {
    const newGroup = await db.groups.findOneAndUpdate(
        {id: id}
        , {
            $set: {name}
        }
        , {returnDocument: 'after'}
    )

    GroupChangeHandler.sendGroupChange(newGroup, newGroup?.users, false, false, false, [], false, [], 'updated')
    GroupChangeHandler.doUpdateDevicesGroupName(newGroup)

    return newGroup
}

export const askUpdateDeviceOriginGroup = async(serial, group, signature) => {
    const data = {ticket: {serial, signature}}

    const stats = await db.groups.updateOne(
        {id: group.id}
        , {$set: data}
    )

    if (stats.modifiedCount) {
        GroupChangeHandler.doUpdateDeviceOriginGroup(Object.assign({}, group, data))
    }

    return stats
}

/** @returns {Promise<mongo.WithId<mongo.Document> | boolean | null>} */
export const updateUserGroup = async(group, data) => {
    const stats = await AllModel.updateUserGroupDuration(group.owner.email, group.duration, data.duration)
    if (!stats.modifiedCount && !stats.matchedCount || group.duration !== data.duration) {
        return false
    }

    const newGroup = await db.groups.findOneAndUpdate(
        {id: group.id}
        , {
            $set: data
        }
        , {returnDocument: 'after'}
    )

    const isChangedDates =
        group?.dates?.length !== newGroup?.dates?.length ||
        group?.dates[0].start.getTime() !== newGroup?.dates[0].start.getTime() ||
        group?.dates[0].stop.getTime() !== newGroup?.dates[0].stop.getTime()

    const isActive = newGroup?.isActive
    const isBecomeActive = !group?.isActive && newGroup?.isActive
    const isBecomeUnactive = group?.isActive && !newGroup?.isActive
    const isChangedName = group?.name !== newGroup?.name
    const isChangedClass = group?.class !== newGroup?.class

    GroupChangeHandler.sendGroupChange(newGroup, newGroup?.users, isChangedDates, isChangedClass, false, [], false, [], 'updated')

    if (isBecomeActive && newGroup?.devices?.length) {
        GroupChangeHandler.doUpdateDevicesCurrentGroup(newGroup, newGroup?.devices)
    }

    if (isBecomeUnactive && newGroup?.devices?.length) {
        GroupChangeHandler.doUpdateDevicesCurrentGroupFromOrigin(newGroup?.devices)
    }

    if (isChangedDates && isActive) {
        GroupChangeHandler.doUpdateDevicesCurrentGroupDates(newGroup)
    }

    if (isChangedName) {
        GroupChangeHandler.doUpdateDevicesGroupName(newGroup)
    }

    return newGroup
}

export const deleteUserGroup = async(id) => {
    const group = await getGroup(id)
    if (group?.privilege === apiutil.ROOT) {
        return 'forbidden'
    }

    await db.groups.deleteOne({id})

    await Promise.all(
        group?.users.map(email => db.groups.updateOne(
            {email}
            , {
                $pull: {'groups.subscribed': id}
            }
        ))
    )

    await AllModel.releaseUserGroupInstance(group?.owner.email)
    await AllModel.updateUserGroupDuration(group?.owner.email, group?.duration, 0)

    if (apiutil.isOriginGroup(group?.class)) {
        await AllModel.returnDevicesToRoot(group?.devices)
    }
    else {
        await AllModel.updateDevicesCurrentGroupFromOrigin(group?.devices)
    }

    GroupChangeHandler.sendGroupChange(group, group?.users, false, false, false, [], false, [], 'deleted')
    GroupChangeHandler.treatGroupDeletion(group)

    return 'deleted'
}

/** @returns {Promise<string>} */
export const getDeviceGroupOwner = async(serial) => {
    const result = await db.devices.findOne({serial: serial})

    return result?.group?.owner
}

export const addGroupModerator = async(id, email) => {
    await addGroupUser(id, email)

    return db.groups.updateOne(
        {id: id},
        {
            $addToSet: {
                moderators: email
            }
        }
    )
}

export const removeGroupModerator = async(id, email) => {
    return db.groups.updateOne(
        {id: id},
        {
            $pull: {
                moderators: email
            }
        }
    )
}

/** @returns {Promise<boolean>} */
export const isGroupModerator = async(id, email) => {
    const group = await db.groups.findOne({
        id: id
        , moderators: email
    })

    return !!group
}
