// teams

import {removeGroupFromTeam} from '../../../controllers/teams.js'

export function del(req, res) {
    return removeGroupFromTeam(req, res)
}


