// stats

import {writeStats} from '../controllers/stats.js'

export function post(req, res, next) {
    return writeStats(req, res, next)
}


