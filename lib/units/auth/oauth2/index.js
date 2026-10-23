import http from 'http'
import express from 'express'
import passport from 'passport'
import logger from '../../../util/logger.js'
import * as urlutil from '../../../util/urlutil.js'
import * as jwtutil from '../../../util/jwtutil.js'
import Strategy from './strategy.js'
import rateLimitConfig from '../../ratelimit/index.js'
import db from '../../../db/index.js'
import dbapi from '../../../db/api.js'
import {ONE_DAY} from '../../../util/apiutil.js'
const log = logger.createLogger('auth-oauth2')

export const createApp = function(options) {
    var app = express()

    app.set('strict routing', true)
    app.set('case sensitive routing', true)
    app.get('/auth/contact', function(req, res) {
        dbapi.getRootGroup().then(function(group) {
            res.status(200)
                .json({
                    success: true,
                    contact: group?.owner
                })
        })
            .catch(function(err) {
                log.error('Unexpected error', err.stack)
                res.status(500)
                    .json({
                        success: false,
                        error: 'ServerError'
                    })
            })
    })
    app.get('/auth/docs', function(req, res) {
        res.status(200)
            .json({
                success: true,
                docsUrl: options.docsUrl
            })
    })
    function verify(accessToken, refreshToken, profile, done) {
        done(null, profile)
    }
    passport.use(new Strategy(options.oauth, verify))
    app.use(rateLimitConfig)
    app.use(passport.initialize())
    // Every route below starts or completes a login: plain requests such as /auth/docs go above
    app.use(passport.authenticate('oauth2', {
        failureRedirect: '/auth/oauth/',
        session: false
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
    app.get('/auth/oauth/callback', function(/** @type {any} */ req, res) {
        if (isEmailAllowed(req.user.email)) {
            res.redirect(urlutil.addParams(options.appUrl, {
                jwt: jwtutil.encode({
                    payload: {
                        email: req.user.email,
                        name: req.user.email.split('@', 1).join('')
                    },
                    secret: options.secret,
                    header: {
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
    return app
}

export default (async function(options) {
    await db.connect()

    const server = http.createServer(createApp(options))
    server.listen(options.port)
    log.info('Listening on port %d', options.port)
})
