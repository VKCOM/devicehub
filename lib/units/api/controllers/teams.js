import * as apiutil from '../../../util/apiutil.js'
import dbapi from '../../../db/api.js'
import { publishTeam } from '../../../util/apiutil.js'

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
    const teamName = req.body.name
    let users = req.body.users
    let groups = req.body.groups

    if (!users) {
        users = []
    }
    if (!groups) {
        groups = []
    }

    const existingTeams = await dbapi.getTeamByName(teamName)
    if (existingTeams) {
        return apiutil.respond(res, 400, 'Team with this name already exists')
    }

    const team = await dbapi.createTeam(teamName, groups, users)
    return apiutil.respond(res, 200, 'Team info (created)', {team: publishTeam(team)})
}

export {getTeamById, createTeam}
export default {
    getTeamById: getTeamById,
    createTeam: createTeam,
}
