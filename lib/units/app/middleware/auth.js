import * as jwtutil from '../../../util/jwtutil.js'
import * as urlutil from '../../../util/urlutil.js'
import * as dbapi from '../../../db/api.js'
import {accessTokenAuth} from '../../api/helpers/securityHandlers.js'
export default (function(options) {
    return function(req, res, next) {
        if (req.query.jwt) {
            // Coming from auth client
            let data = jwtutil.decode(req.query.jwt, options.secret)
            let redir = urlutil.removeParam(req.url, 'jwt')
            if (data) {
                // Redirect once to get rid of the token
                dbapi.saveUserAfterLogin({
                    name: data.name
                    , email: data.email
                    , ip: req.ip
                })
                    .then(function() {
                        req.session.jwt = data
                        req.sessionOptions.httpOnly = false
                        dbapi.loadUser(data.email).then(user => {
                            if (user.acceptedPolicy) {
                                res.append('Set-Cookie', `token=${req.query.jwt}; HttpOnly`)
                                res.append('Access-Control-Allow-Credentials', 'true')
                                res.redirect(redir)
                            }
                            else {
                                res.append('Set-Cookie', `token=${req.query.jwt}; HttpOnly`)
                                res.append('Access-Control-Allow-Credentials', 'true')
                                res.redirect(redir + '?need_accept=1')
                            }
                        })
                    })
                    .catch(next)
            }
            else {
                // Invalid token, forward to auth client
                const response = {
                    success: false
                    , description: 'Invalid Token'
                }
                res.setHeader('Cache-Control', 'no-store')
                res.status(403).json(response)
            }
        }
        else if (req.session && req.session.jwt) {
            dbapi.loadUser(req.session.jwt.email)
                .then(function(user) {
                    if (user) {
                    // Continue existing session
                        req.user = user
                        next()
                    }
                    else {
                    // We no longer have the user in the database
                        res.redirect(options.authUrl)
                    }
                })
                .catch(next)
        }
        else if (req.headers.authorization || req.cookies.token) { // needed for /app/api/v1/ requests
            req.options = {
                secret: options.secret
            }
            accessTokenAuth(req).catch((err) => {
                res.redirect(options.authUrl)
                res.json(err)
            })
        }
        else {
            // No session, forward to auth client
            res.redirect(options.authUrl)
        }
    }
})
