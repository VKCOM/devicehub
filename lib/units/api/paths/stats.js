// stats

import {writeStats} from '../controllers/stats.js'

export function post(req, res) {
    return writeStats(req, res)
}


