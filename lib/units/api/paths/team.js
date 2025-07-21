// teams

import {createTeam} from '../controllers/teams.js'

export function post(req, res) {
    return createTeam(req, res)
}


