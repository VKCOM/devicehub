// @ts-nocheck
import http from 'http'
import express from 'express'
import validator from 'express-validator'
import bodyParser from 'body-parser'
import Promise from 'bluebird'
import basicAuth from 'basic-auth'
import logger from '../../util/logger.js'
import * as requtil from '../../util/requtil.js'
import * as jwtutil from '../../util/jwtutil.js'
import * as pathutil from '../../util/pathutil.cjs'
import lifecycle from '../../util/lifecycle.js'
import rateLimitConfig from '../ratelimit/index.js'
import {ONE_DAY} from '../../util/apiutil.js'
export default (function(options) {
    const log = logger.createLogger('auth-mock')
    let app = express()
    let server = Promise.promisifyAll(http.createServer(app))
    lifecycle.observe(function() {
        log.info('Waiting for client connections to end')
        return server.closeAsync()
            .catch(function() {
            // Okay
            })
    })
    // BasicAuth Middleware
    var basicAuthMiddleware = function(req, res, next) {
        function unauthorized(res) {
            res.set('WWW-Authenticate', 'Basic realm=Authorization Required')
            return res.send(401)
        }
        var user = basicAuth(req)
        if (!user || !user.name || !user.pass) {
            return unauthorized(res)
        }
        if (user.name === options.mock.basicAuth.username &&
            user.pass === options.mock.basicAuth.password) {
            return next()
        }
        else {
            return unauthorized(res)
        }
    }
    app.use(function(req, res, next) {
        res.setHeader('X-devicehub-unit', 'auth-mock')
        next()
    })
    app.set('strict routing', true)
    app.set('case sensitive routing', true)
    app.use(bodyParser.json())
    app.use(validator())
    app.use(rateLimitConfig)
    if (options.mock.useBasicAuth) {
        app.use(basicAuthMiddleware)
    }
    app.get('/', function(req, res) {
        res.redirect('/auth/mock/')
    })
    app.get('/auth/contact', function(req, res) {
        res.status(200)
            .json({
                success: true,
                contactUrl: options.supportUrl
            })
    })
    app.get('/auth/docs', function(req, res) {
        res.status(200)
            .json({
                success: true,
                docsUrl: options.docsUrl
            })
    })
    app.get('/', function(req, res) {
        res.redirect('/#/auth/mock/')
    })
    app.get('/auth/mock/*', (req, res) => {
        res.sendFile(pathutil.reactFrontend('dist/auth/auth-mock.html'))
    })
    app.post('/auth/api/v1/mock', function(req, res) {
        log.setLocalIdentifier(req.ip)
        switch (req.accepts(['json'])) {
        case 'json':
            requtil.validate(req, function() {
                req.checkBody('name').notEmpty()
                req.checkBody('email').isEmail()
            })
                .then(function() {
                    log.info('Authenticated "%s"', req.body.email)
                    log.info('options.appUrl "%s"', options.appUrl)
                    var token = jwtutil.encode({
                        payload: {
                            email: req.body.email,
                            name: req.body.name
                        },
                        secret: options.secret,
                        header: {
                            exp: Date.now() + ONE_DAY
                        }
                    })
                    res.status(200)
                        .json({
                            success: true,
                            jwt: token,
                            redirect: options.appUrl
                        })
                })
                .catch(requtil.ValidationError, function(err) {
                    res.status(400)
                        .json({
                            success: false,
                            error: 'ValidationError',
                            validationErrors: err.errors
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
            break
        default:
            res.send(406)
            break
        }
    })
    server.listen(options.port)
    log.info('Listening on port %d', options.port)
})
