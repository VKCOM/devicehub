// teams

import {getTeamById, updateTeam, removeFromTeam} from '../../controllers/teams.js'

export function get(req, res) {
    return getTeamById(req, res)
}


export function post(req, res) {
    return updateTeam(req, res)
}


export function del(req, res) {
    return removeFromTeam(req, res)
}


