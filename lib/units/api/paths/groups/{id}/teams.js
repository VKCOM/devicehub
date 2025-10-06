// teams

import {getGroupsTeams} from '../../../controllers/teams.js'

export function get(req, res) {
    return getGroupsTeams(req, res)
}


