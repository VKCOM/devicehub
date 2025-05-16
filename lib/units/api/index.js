import http from 'http'
import path from 'path'
import events from 'events'
import express from 'express'
import cors from 'cors'
import {initialize as expressInitialize} from 'express-openapi'
import cookieSession from 'cookie-session'
import cookieParser from 'cookie-parser'
import _ from 'lodash'
import logger from '../../util/logger.js'
import {auth} from './auth.js'
import lifecycle from '../../util/lifecycle.js'
import rateLimitConfig from '../ratelimit/index.js'
import bodyParser from 'body-parser'
import {accessTokenAuth} from './helpers/securityHandlers.js'
import db from '../../db/index.js'

export default (async function(options) {
    const log = logger.createLogger('api')
    const app = express()
    app.use(function(req, res, next) {
        res.setHeader('X-devicehub-unit', 'api')
        next()
    })
    app.use(cors({
        origin: 'http://localhost:5173'
        , credentials: true
        , optionsSuccessStatus: 200
    }))
    try {
        const Sentry = await import('@sentry/node')

        Sentry.setupExpressErrorHandler(app)
        app.get('/debug-sentry', function mainHandler(req, res) {
            Sentry.startSpan({
                op: 'test'
                , name: 'My First Test Span',
            }, () => {
                try {
                    throw new Error('Span error.')
                }
                catch (e) {
                    Sentry.captureException(e)
                }
            })
            throw new Error('My first Sentry error!')
        })
    }
    catch {
        log.error('Could not add sentry error handler')
    }

    const server = http.createServer(app)

    const {
        sub
        , subdev
        , push
        , pushdev
        , channelRouter
    } = await db.createZMQSockets(options.endpoints, log)
    await db.connect(push, pushdev, channelRouter)

    channelRouter.setMaxListeners(100)

    // Swagger Express Config
    app.use(bodyParser.json())
    app.use(cookieParser())
    app.use(rateLimitConfig)

    app.use(auth({
        secret: options.secret
        , authUrl: options.authUrl
    }))

    app.use(function authMiddleware(req, res, next) { // todo: create a proper auth middleware
        let reqOptions = _.merge(options, {
            push: push
            , sub: sub
            , channelRouter: channelRouter
            , pushdev: pushdev
            , subdev: subdev
        })
        // @ts-ignore
        req.options = reqOptions
        if (req.path === '/api/v1/scheme') {
            next()
            return
        }
        accessTokenAuth(req)
            .then(() => {
                next()
            })
            .catch(err => {
                if (options.authUrl) {
                    res.status(303)
                    res.setHeader('Location', options.authUrl)
                }
                else {
                    res.status(err.status)
                }
                res.json({message: err.message})
            })
    })
    let config = {
        app
        , basePath: '/api/v1'
        , promiseMode: true
        , appRoot: import.meta.dirname
        , exposeApiDocs: true
        , apiDoc: path.resolve(import.meta.dirname, 'swagger', 'api_v1.yaml')
        , paths: path.resolve(import.meta.dirname, 'paths')
        , docsPath: '/scheme'
        , errorMiddleware: function(err, req, res, next) { // only handles errors for /v3/*
            if (err instanceof Object) {
                res.status(err.status || 500).json(err.errors || err.description || {message: 'Unknown server error'})
            }
            next(err)
        }
    }
    expressInitialize(config)

    // TODO: Remove this once frontend is stateless
    app.use(cookieSession({
        name: options.ssid
        , keys: [options.secret]
    }))
    lifecycle.observe(function() {
        [push, sub, pushdev, subdev].forEach(function(sock) {
            try {
                sock.close()
            }
            catch (err) {
                // No-op
            }
        })
    })
    server.listen(options.port)
    log.info('Listening on port %d', options.port)
})
