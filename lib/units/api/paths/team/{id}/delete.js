// teams

import {deleteTeam} from '../../../controllers/teams.js'

export function del(req, res) {
    return deleteTeam(req, res)
}


