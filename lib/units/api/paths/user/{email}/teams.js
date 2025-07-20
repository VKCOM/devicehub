// teams

import {getUserTeams} from '../../../controllers/teams.js'

export function get(req, res) {
    return getUserTeams(req, res)
}


