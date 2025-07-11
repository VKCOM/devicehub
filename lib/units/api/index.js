import path from 'path'
import express from 'express'
import {initialize as expressInitialize} from 'express-openapi'
import _ from 'lodash'
import logger from '../../util/logger.js'
import {auth} from './auth.js'
import lifecycle from '../../util/lifecycle.js'
import rateLimitConfig from '../ratelimit/index.js'
import bodyParser from 'body-parser'
import {accessTokenAuth} from './helpers/securityHandlers.js'
import db from '../../db/index.js'

const basePath = '/api/v1'
const expressOpenapiUse = (app, handler) => (['get', 'post', 'put', 'delete', 'patch', 'options', 'head']).forEach(method => {
    const appMethod = app[method].bind(app)
    app[method] = (path, ...handlers) => {
        if (typeof path === 'string' && path.startsWith(basePath)) {
            handlers.push(handler, handlers.pop())
        }
        return appMethod(path, ...handlers)
    }
})

export default (async function(options) {
    const log = logger.createLogger('api')
    const app = express()
    app.use(function(req, res, next) {
        res.setHeader('X-devicehub-unit', 'api')
        next()
    })
    try {
        const Sentry = await import('@sentry/node')

        Sentry.setupExpressErrorHandler(app)
        app.get('/debug-sentry', function mainHandler(req, res) {
            Sentry.startSpan({
                op: 'test',
                name: 'My First Test Span',
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

    const {
        sub
        , subdev
        , push
        , pushdev
        , channelRouter
    } = await db.createZMQSockets(options.endpoints, log)
    await db.connect(push, pushdev, channelRouter, true)

    channelRouter.setMaxListeners(100)

    app.use(bodyParser.json())
    app.use(rateLimitConfig)

    app.use(auth({
        secret: options.secret,
        authUrl: options.authUrl
    }))

    expressOpenapiUse(app, (req, res, next) => { // todo: create a proper auth middleware
        // @ts-ignore
        req.options = _.merge(options, {
            push: push,
            sub: sub,
            channelRouter: channelRouter,
            pushdev: pushdev,
            subdev: subdev
        })
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

    // Swagger Express Config
    await expressInitialize({
        app,
        promiseMode: true,
        exposeApiDocs: true,
        apiDoc: path.resolve(import.meta.dirname, 'swagger', 'api_v1.yaml'),
        paths: path.resolve(import.meta.dirname, 'paths'),
        docsPath: '/scheme',
        errorMiddleware: function(err, req, res, next) { // only handles errors for /v3/*
            if (err instanceof Object) {
                res.status(err.status || 500).json(err.errors || err.description || {message: 'Unhandled server error'})
            }
            next(err)
        }
    })

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
    app.listen(options.port)
    log.info('Listening on port %d', options.port)
})
