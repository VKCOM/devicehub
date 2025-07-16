/* *
 * Copyright © 2025 contains code contributed by V Kontakte LLC - Licensed under the Apache license 2.0
 * */

import db from '../../index.js'
import logger from '../../../util/logger.js'
import mongo from 'mongodb'

const log = logger.createLogger('dbapi:team')

/** @returns {Promise<mongo.InsertOneResult<mongo.Document> | null>} */
export const createTeam = async(name, groups, users) => {
    return db.teams.insertOne({name: name, groups: groups, users: users})
}

/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const getTeamById = async(id) => {
    return db.groups.findOne({id: id})
}

/** @returns {Promise<mongo.WithId<mongo.Document>[] | null>} */
export const getTeamByName = async(name) => {
    return db.teams.find({name: name}).toArray()
}


/** @returns {Promise<mongo.WithId<mongo.Document> | null>} */
export const addGroupToTeam = async(teamId, group) => {
    return db.teams.findOneAndUpdate(
        {
            _id: teamId
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
            _id: teamId
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
            _id: teamId
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
            _id: teamId
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
