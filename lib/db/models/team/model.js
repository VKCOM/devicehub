/* *
 * Copyright 2025 contains code contributed by V Kontakte LLC - Licensed under the Apache license 2.0
 * */

import db from '../../index.js'
import logger from '../../../util/logger.js'
import mongo from 'mongodb'
import {v4 as uuidv4} from 'uuid'
import util from 'util'
import {addGroupUser, removeGroupUser} from '../group/model.js'

const log = logger.createLogger('dbapi:team')

export const createTeam = async(name, groups, users) => {
    const teamId = util.format('%s', uuidv4()).replace(/-/g, '')
    await db.teams.insertOne({id: teamId, name: name, groups: groups, users: users})
    await updateGroupsAndUsers(teamId)
    return await getTeamById(teamId)
}


/** @returns {Promise<Array<mongo.WithId<mongo.Document>> | null>} */
export const getTeams = async() => {
    return db.teams.find({}).toArray()
}


/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const getTeamById = async(id) => {
    return db.teams.findOne({id: id})
}

export const updateTeamName = async(teamId, name) => {
    return db.teams.findOneAndUpdate(
        {
            id: teamId
        },
        {
            $set: {
                name: name
            }
        }
    )
}


/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const addGroupToTeam = async(teamId, group) => {
    const result = await db.teams.findOneAndUpdate(
        {
            id: teamId
        },
        {
            $addToSet: {
                groups: group
            }
        }
    )
    await updateGroupsAndUsers(teamId)
    return result
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const removeGroupFromTeam = async(teamId, group) => {
    const result = await db.teams.findOneAndUpdate(
        {
            id: teamId
        },
        {
            $pull: {
                groups: group
            }
        }
    )
    await removeGroupFromTeamUsers(teamId, group)
    return result
}

/** @returns {Promise<mongo.UpdateResult<mongo.Document> | null>} */
export const removeGroupsFromTeam = async(teamId, groups) => {
    const result = await db.teams.updateMany(
        {
            id: teamId
        },
        {
            $pullAll: {
                groups: groups
            }
        }
    )
    for (const group of groups) {
        await removeGroupFromTeamUsers(teamId, group)
    }
    return result
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const addUserToTeam = async(teamId, user) => {
    const result = await db.teams.findOneAndUpdate(
        {
            id: teamId
        },
        {
            $addToSet: {
                users: user
            }
        }
    )
    await updateGroupsAndUsers(teamId)
    return result
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const removeUserFromTeam = async(teamId, user) => {
    const result = await db.teams.findOneAndUpdate(
        {
            id: teamId
        },
        {
            $pull: {
                users: user
            }
        }
    )

    await removeUserFromTeamGroups(teamId, user)
    return result
}

/** @returns {Promise<mongo.UpdateResult<mongo.Document> | null>} */
export const removeUsersFromTeam = async(teamId, users) => {
    const result = await db.teams.updateMany(
        {
            id: teamId
        },
        {
            $pullAll: {
                users: users
            }
        }
    )

    for (const user of users) {
        await removeUserFromTeamGroups(teamId, user)
    }
    return result
}

/** @returns {Promise<Array<mongo.WithId<mongo.Document>> | null>} */
export const getTeamsByUser = async(email) => {
    return db.teams.find({users: {$in: [email]}}).toArray()
}

/** @returns {Promise<Array<mongo.WithId<mongo.Document>> | null>} */
export const getTeamsByGroup = async(group) => {
    return db.teams.find({groups: {$in: [group]}}).toArray()
}

/** @returns {Promise<mongo.DeleteResult| null>} */
export const deleteTeam = async(id) => {
    await removeGroupsAndUsers(id)
    return db.teams.deleteOne({id: id})
}

const updateGroupsAndUsers = async(/** @type {string} */ teamId) => {
    log.debug(`updateGroupsAndUsers for ${teamId}`)
    const team = await getTeamById(teamId)
    for (const group of team?.groups) {
        for (const user of team?.users) {
            await addGroupUser(group, user)
        }
    }
}

const removeGroupsAndUsers = async(teamId) => {
    log.debug(`removeGroupsAndUsers for ${teamId}`)
    const team = await getTeamById(teamId)
    for (const groupId of team?.groups) {
        for (const userEmail of team?.users) {
            await removeGroupUser(groupId, userEmail)
        }
    }
}

const removeUserFromTeamGroups = async(teamId, user) => {
    const team = await getTeamById(teamId)
    for (const group of team?.groups) {
        await removeGroupUser(group, user)
    }
}

const removeGroupFromTeamUsers = async(teamId, group) => {
    const team = await getTeamById(teamId)
    for (const user of team?.users) {
        await removeGroupUser(group, user)
    }
}
