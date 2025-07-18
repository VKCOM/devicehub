// user

import {getAccessTokens} from '../../controllers/user.js'

export function get(req, res) {
    return getAccessTokens(req, res)
}


