import http from 'http'
import express from 'express'
import cors from 'cors'
import * as passport from 'passport'
import logger from '../../../util/logger.js'
import * as urlutil from '../../../util/urlutil.js'
import * as jwtutil from '../../../util/jwtutil.js'
import Strategy from './strategy.js'
import rateLimitConfig from '../../ratelimit/index.js'
import * as dbapi from '../../../db/api.js'
import {ONE_DAY} from '../../../util/apiutil.js'
export default (function(options) {
    var log = logger.createLogger('auth-oauth2')
    var app = express()
    var server = http.createServer(app)
    app.set('strict routing', true)
    app.set('case sensitive routing', true)
    app.get('/auth/contact', function(req, res) {
        dbapi.getRootGroup().then(function(group) {
            res.status(200)
                .json({
                    success: true
                    , contact: group.owner
                })
        })
            .catch(function(err) {
                log.error('Unexpected error', err.stack)
                res.status(500)
                    .json({
                        success: false
                        , error: 'ServerError'
                    })
            })
    })
    function verify(accessToken, refreshToken, profile, done) {
        done(null, profile)
    }
    passport.use(new Strategy(options.oauth, verify))
    app.use(cors({
        origin: 'http://localhost:5173'
        , credentials: true
        , optionsSuccessStatus: 200
    }))
    app.use(rateLimitConfig)
    app.use(passport.initialize())
    app.use(passport.authenticate('oauth2', {
        failureRedirect: '/auth/oauth/'
        , session: false
    }))
    function isEmailAllowed(email) {
        if (email) {
            if (options.domain) {
                return email.endsWith(options.domain)
            }
            return true
        }
        return false
    }
    app.get('/auth/oauth/callback', function(req, res) {
        if (isEmailAllowed(req.user.email)) {
            res.redirect(urlutil.addParams(options.appUrl, {
                jwt: jwtutil.encode({
                    payload: {
                        email: req.user.email
                        , name: req.user.email.split('@', 1).join('')
                    }
                    , secret: options.secret
                    , header: {
                        exp: Date.now() + ONE_DAY
                    }
                })
            }))
        }
        else {
            log.warn('Missing or disallowed email in profile', req.user)
            res.render('rejected-email')
        }
    })
    server.listen(options.port)
    log.info('Listening on port %d', options.port)
})
