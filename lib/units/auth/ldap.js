import http from 'http'
import express from 'express'
import cors from 'cors'
import validator from 'express-validator'
import cookieSession from 'cookie-session'
import bodyParser from 'body-parser'
import serveStatic from 'serve-static'
import csrf from 'csurf'
import Promise from 'bluebird'
import logger from '../../util/logger.js'
import * as requtil from '../../util/requtil.js'
import * as ldaputil from '../../util/ldaputil.js'
import * as jwtutil from '../../util/jwtutil.js'
import * as pathutil from '../../util/pathutil.cjs'
import * as urlutil from '../../util/urlutil.js'
import lifecycle from '../../util/lifecycle.js'
import rateLimitConfig from '../ratelimit/index.js'
import {ONE_DAY} from '../../util/apiutil.js'
export default (function(options) {
    var log = logger.createLogger('auth-ldap')
    var app = express()
    var server = Promise.promisifyAll(http.createServer(app))
    lifecycle.observe(function() {
        log.info('Waiting for client connections to end')
        return server.closeAsync()
            .catch(function() {
            // Okay
            })
    })
    app.use(function(req, res, next) {
        res.setHeader('X-devicehub-unit', 'auth-ldap')
        next()
    })
    app.set('strict routing', true)
    app.set('case sensitive routing', true)
    app.use(cookieSession({
        name: options.ssid
        , keys: [options.secret]
    }))
    app.use(rateLimitConfig)
    app.use(bodyParser.json())
    app.use(cors({
        origin: 'http://localhost:5173'
        , credentials: true
        , optionsSuccessStatus: 200
    }))
    app.use(csrf())
    app.use(validator())
    app.use(function(req, res, next) {
        res.cookie('XSRF-TOKEN', req.csrfToken())
        next()
    })
    app.get('/', function(req, res) {
        res.redirect('/auth/ldap/')
    })
    app.get('/auth/contact', function(req, res) {
        res.status(200)
            .json({
                success: true
                , contactUrl: options.supportUrl
            })
    })
    app.get('/auth/docs', function(req, res) {
        res.status(200)
            .json({
                success: true
                , docsUrl: options.docsUrl
            })
    })
    app.get('/', function(req, res) {
        res.redirect('/#/auth/ldap/')
    })
    app.get('/auth/ldap/*', (req, res) => {
        res.sendFile(pathutil.reactFrontend('dist/auth/auth-ldap.html'))
    })
    app.post('/auth/api/v1/ldap', function(req, res) {
        var log = logger.createLogger('auth-ldap')
        log.setLocalIdentifier(req.ip)
        switch (req.accepts(['json'])) {
        case 'json':
            requtil.validate(req, function() {
                req.checkBody('username').notEmpty()
                req.checkBody('password').notEmpty()
            })
                .then(function() {
                    return ldaputil.login(options.ldap, req.body.username, req.body.password)
                })
                .then(function(user) {
                    log.info('Authenticated "%s"', ldaputil.email(user))
                    var token = jwtutil.encode({
                        payload: {
                            email: ldaputil.email(user)
                            , name: user[options.ldap.username.field]
                        }
                        , secret: options.secret
                        , header: {
                            exp: Date.now() + ONE_DAY
                        }
                    })
                    res.status(200)
                        .json({
                            success: true
                            , jwt: token
                            , redirect: options.appUrl
                        })
                })
                .catch(requtil.ValidationError, function(err) {
                    res.status(400)
                        .json({
                            success: false
                            , error: 'ValidationError'
                            , validationErrors: err.errors
                        })
                })
                .catch(ldaputil.InvalidCredentialsError, function(err) {
                    log.warn('Authentication failure for "%s"', err.user)
                    res.status(400)
                        .json({
                            success: false
                            , error: 'InvalidCredentialsError'
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
            break
        default:
            res.send(406)
            break
        }
    })
    server.listen(options.port)
    log.info('Listening on port %d', options.port)
})
