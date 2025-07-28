// teams

import {removeUserFromTeam} from '../../../../controllers/teams.js'

export function del(req, res) {
    return removeUserFromTeam(req, res)
}


