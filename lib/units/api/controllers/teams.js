import * as apiutil from '../../../util/apiutil.js'
import dbapi from '../../../db/api.js'
import {publishTeam} from '../../../util/apiutil.js'
import util from 'util'
import {v4 as uuidv4} from 'uuid'


async function getTeams(req, res) {
    const teams = await dbapi.getTeams()
    let response = []
    teams?.forEach((team) => {
        response.push(publishTeam(team))
    })
    apiutil.respond(res, 200, 'Teams Information', {teams: response})
}

function getTeamById(req, res) {
    const teamId = req.params.id
    dbapi.getTeamById(teamId)
        .then((team) => {
            if (!team) {
                apiutil.respond(res, 400, 'Not Found')
            }
            if (team?.length === 0) {
                apiutil.respond(res, 400, 'Not Found')
            }
            apiutil.respond(res, 200, 'Team info', {team: publishTeam(team)})
        })
        .catch(() => {
            apiutil.internalError(res, 'Failed')
        })
}

async function createTeam(req, res) {
    const teamName = req.body.name ?? 'New_team_' + util.format('%s', uuidv4()).replace(/-/g, '')
        
    let users = req.body.users
    let groups = req.body.groups

    if (!users) {
        users = []
    }
    if (!groups) {
        groups = []
    }

    const team = await dbapi.createTeam(teamName, groups, users)
    return apiutil.respond(res, 200, 'Team info (created)', {team: publishTeam(team)})
}

async function updateTeam(req, res) {
    return groupBulkOperations(req, res, 'update')
}

async function removeFromTeam(req, res) {
    return groupBulkOperations(req, res, 'delete')
}

async function groupBulkOperations(req, res, operation) {
    const teamId = req.params.id
    let users = req.body.users
    let groups = req.body.groups
    let name = req.body.name

    let team = await dbapi.getTeamById(teamId)
    if (!team) {
        apiutil.respond(res, 400, 'Not Found')
    }

    if (!users) {
        users = []
    }
    if (!groups) {
        groups = []
    }

    if (operation === 'update') {
        for (const user of users) {
            await dbapi.addUserToTeam(teamId, user)
        }
        for (const group of groups) {
            await dbapi.addGroupToTeam(teamId, group)
        }
    }
    if (operation === 'delete') {
        await dbapi.removeUsersFromTeam(teamId, users)
        await dbapi.removeGroupsFromTeam(teamId, groups)
    }

    if (name) {
        await dbapi.updateTeamName(teamId, name)
    }

    team = await dbapi.getTeamById(teamId)
    apiutil.respond(res, 200, 'Team info', {team: publishTeam(team)})
}

async function removeUserFromTeam(req, res) {
    const teamId = req.params.id
    const email = req.params.email

    await dbapi.removeUserFromTeam(teamId, email)

    const team = await dbapi.getTeamById(teamId)
    apiutil.respond(res, 200, 'Team info', {team: publishTeam(team)})
}

async function removeGroupFromTeam(req, res) {
    const teamId = req.params.id
    const group = req.params.group

    await dbapi.removeGroupFromTeam(teamId, group)

    const team = await dbapi.getTeamById(teamId)
    apiutil.respond(res, 200, 'Team info', {team: publishTeam(team)})
}

async function getUserTeams(req, res) {
    const email = req.params.email

    const teams = await dbapi.getTeamsByUser(email)
    let response = []
    teams?.forEach((team) => {
        response.push(publishTeam(team))
    })
    apiutil.respond(res, 200, 'User team info', {teams: response})
}

async function getGroupsTeams(req, res) {
    const group = req.params.id
    const teams = await dbapi.getTeamsByGroup(group)
    let response = []
    teams?.forEach((team) => {
        response.push(publishTeam(team))
    })
    apiutil.respond(res, 200, 'Groups team info', {teams: response})
}

async function deleteTeam(req, res) {
    const teamId = req.params.id
    await dbapi.deleteTeam(teamId)
    apiutil.respond(res, 200, 'Team deleted')
}

export {getTeams, getTeamById, createTeam, updateTeam, removeFromTeam, removeUserFromTeam, removeGroupFromTeam, getUserTeams, getGroupsTeams, deleteTeam}
export default {
    getTeams: getTeams,
    getTeamById: getTeamById,
    createTeam: createTeam,
    updateTeam: updateTeam,
    removeFromTeam: removeFromTeam,
    removeUserFromTeam: removeUserFromTeam,
    removeGroupFromTeam: removeGroupFromTeam,
    getUserTeams: getUserTeams,
    getGroupsTeams: getGroupsTeams,
    deleteTeam: deleteTeam,
}
