/* *
 * Copyright © 2025 contains code contributed by V Kontakte LLC - Licensed under the Apache license 2.0
 * */

import db from '../../index.js'
import logger from '../../../util/logger.js'
import mongo from 'mongodb'
import {v4 as uuidv4} from 'uuid'
import util from 'util'

const log = logger.createLogger('dbapi:team')

export const createTeam = async(name, groups, users) => {
    const teamId = util.format('%s', uuidv4()).replace(/-/g, '')
    await db.teams.insertOne({id: teamId, name: name, groups: groups, users: users})
    return await getTeamById(teamId)
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const getTeamById = async(id) => {
    return db.teams.findOne({id: id})
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const getTeamByName = async(name) => {
    return db.teams.findOne({name: name})
}


/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const addGroupToTeam = async(teamId, group) => {
    return db.teams.findOneAndUpdate(
        {
            id: teamId
        },
        {
            $addToSet: {
                groups: group
            }
        }
    )
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const removeGroupFromTeam = async(teamId, group) => {
    return db.teams.findOneAndUpdate(
        {
            id: teamId
        },
        {
            $pull: {
                groups: group
            }
        }
    )
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const addUserToTeam = async(teamId, user) => {
    return db.teams.findOneAndUpdate(
        {
            id: teamId
        },
        {
            $addToSet: {
                users: user
            }
        }
    )
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const removeUserFromTeam = async(teamId, user) => {
    return db.teams.findOneAndUpdate(
        {
            id: teamId
        },
        {
            $pull: {
                users: user
            }
        }
    )
}

/** @returns {Promise<Array<mongo.WithId<mongo.Document>> | null>} */
export const getTeamsByUser = async(email) => {
    return db.teams.find({users: {$in: [email]}}).toArray()
}

export const getTeamsByGroup = async(group) => {
    return db.teams.find({groups: {$in: [group]}}).toArray()
}

/** @returns {Promise<boolean>} */
export const isTeamMember = async(id, email) => {
    const group = await db.teams.findOne({
        id: id,
        users: email
    })

    return !!group
}
