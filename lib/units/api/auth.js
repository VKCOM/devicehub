// import * as jwtutil from '../../util/jwtutil.js'
// import * as urlutil from '../../util/urlutil.js'
// import dbapi from '../../db/api.js'
import {accessTokenAuth} from './helpers/securityHandlers.js'
export function auth(options) {
    return function(req, res, next) {
        if (req.headers.authorization) { // needed for /app/api/v1/ requests
            req.options = {
                secret: options.secret
            }
            accessTokenAuth(req)
                .then(() => {
                    next()
                })
                .catch((err) => {
                    res.status(err.status)
                    res.json({message: err.message})
                })
        }
        else {
            res.redirect('/')
        }
    }
}
