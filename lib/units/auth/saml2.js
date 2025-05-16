// @ts-nocheck
import fs from 'fs'
import http from 'http'
import express from 'express'
import * as passport from 'passport'
import * as passportSaml from 'passport-saml'
import bodyParser from 'body-parser'
import _ from 'lodash'
import logger from '../../util/logger.js'
import * as urlutil from '../../util/urlutil.js'
import * as jwtutil from '../../util/jwtutil.js'
import rateLimitConfig from '../ratelimit/index.js'
import db from '../../db/index.js'
import dbapi from '../../db/api.js'
import {ONE_DAY} from '../../util/apiutil.js'
var SamlStrategy = {Strategy: passportSaml}.Strategy
export default (async function(options) {
    var log = logger.createLogger('auth-saml2')
    var app = express()
    var server = http.createServer(app)

    await db.connect()

    app.use(function(req, res, next) {
        res.setHeader('X-devicehub-unit', 'auth-saml2')
        next()
    })
    app.set('strict routing', true)
    app.set('case sensitive routing', true)
    app.use(bodyParser.urlencoded({extended: false}))
    app.use(passport.initialize())
    app.use(rateLimitConfig)
    passport.serializeUser(function(user, done) {
        done(null, user)
    })
    passport.deserializeUser(function(user, done) {
        done(null, user)
    })
    var verify = function(profile, done) {
        return done(null, profile)
    }
    var samlConfig = {
        entryPoint: options.saml.entryPoint
        , issuer: options.saml.issuer
    }
    if (options.saml.certPath) {
        samlConfig = _.merge(samlConfig, {
            cert: fs.readFileSync(options.saml.certPath).toString()
        })
    }
    if (options.saml.callbackUrl) {
        samlConfig = _.merge(samlConfig, {
            callbackUrl: options.saml.callbackUrl
        })
    }
    else {
        samlConfig = _.merge(samlConfig, {
            path: '/auth/saml/callback'
        })
    }
    var mySamlStrategy = new SamlStrategy(samlConfig, verify)
    app.get('/auth/saml/metadata', function(req, res) {
        res.type('application/xml')
        res.send((mySamlStrategy.generateServiceProviderMetadata()))
    })
    passport.use(mySamlStrategy)
    app.use(passport.authenticate('saml', {
        failureRedirect: '/auth/saml/'
        , session: false
    }))
    app.post('/auth/saml/callback', function(req, res) {
        if (req.user.email) {
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
            log.warn('Missing email in profile', req.user)
            res.redirect('/auth/saml/')
        }
    })
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
    app.get('/auth/docs', function(req, res) {
        res.status(200)
            .json({
                success: true
                , docsUrl: options.docsUrl
            })
    })
    server.listen(options.port)
    log.info('Listening on port %d', options.port)
})
