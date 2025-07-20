// teams

import {getTeams} from '../controllers/teams.js'

export function get(req, res) {
    return getTeams(req, res)
}


