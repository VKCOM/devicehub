import http from 'http'
import path from 'path'
import events from 'events'
import express from 'express'
import cors from 'cors'
import {initialize as expressInitialize} from 'express-openapi'
import cookieSession from 'cookie-session'
import cookieParser from 'cookie-parser'
import Promise from 'bluebird'
import _ from 'lodash'
import logger from '../../util/logger.js'
import * as zmqutil from '../../util/zmqutil.js'
import srv from '../../util/srv.js'
import lifecycle from '../../util/lifecycle.js'
import wireutil from '../../wire/util.js'
import rateLimitConfig from '../ratelimit/index.js'
import bodyParser from 'body-parser'
import {accessTokenAuth} from './helpers/securityHandlers.js'
export default (async function(options) {
    var log = logger.createLogger('api')
    var app = express()
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

    var server = http.createServer(app)
    var channelRouter = new events.EventEmitter()
    channelRouter.setMaxListeners(100)
    var push = zmqutil.socket('push')
    Promise.map(options.endpoints.push, function(endpoint) {
        return srv.resolve(endpoint).then(function(records) {
            return srv.attempt(records, function(record) {
                log.info('Sending output to "%s"', record.url)
                push.connect(record.url)
                return Promise.resolve(true)
            })
        })
    })
        .catch(function(err) {
            log.fatal('Unable to connect to push endpoint', err)
            lifecycle.fatal()
        })
    // Input
    var sub = zmqutil.socket('sub')
    Promise.map(options.endpoints.sub, function(endpoint) {
        return srv.resolve(endpoint).then(function(records) {
            return srv.attempt(records, function(record) {
                log.info('Receiving input from "%s"', record.url)
                sub.connect(record.url)
                return Promise.resolve(true)
            })
        })
    })
        .catch(function(err) {
            log.fatal('Unable to connect to sub endpoint', err)
            lifecycle.fatal()
        })
    var pushdev = zmqutil.socket('push')
    Promise.map(options.endpoints.pushdev, function(endpoint) {
        return srv.resolve(endpoint).then(function(records) {
            return srv.attempt(records, function(record) {
                log.info('Sending output to "%s"', record.url)
                pushdev.connect(record.url)
                return Promise.resolve(true)
            })
        })
    })
        .catch(function(err) {
            log.fatal('Unable to connect to pushdev endpoint', err)
            lifecycle.fatal()
        })
    var subdev = zmqutil.socket('sub')
    Promise.map(options.endpoints.subdev, function(endpoint) {
        return srv.resolve(endpoint).then(function(records) {
            return srv.attempt(records, function(record) {
                log.info('Receiving input from "%s"', record.url)
                subdev.connect(record.url)
                return Promise.resolve(true)
            })
        })
    })
        .catch(function(err) {
            log.fatal('Unable to connect to subdev endpoint', err)
            lifecycle.fatal()
        });
    [wireutil.global].forEach(function(channel) {
        log.info('Subscribing to permanent channel "%s"', channel)
        sub.subscribe(channel)
        subdev.subscribe(channel)
    })
    sub.on('message', function(channel, data) {
        channelRouter.emit(channel.toString(), channel, data)
    })
    subdev.on('message', function(channel, data) {
        channelRouter.emit(channel.toString(), channel, data)
    })
    // Swagger Express Config
    app.use(bodyParser.json())
    app.use(cookieParser())
    app.use(rateLimitConfig)

    app.use(function(req, res, next) {
        let reqOptions = _.merge(options, {
            push: push
            , sub: sub
            , channelRouter: channelRouter
            , pushdev: pushdev
            , subdev: subdev
        })
        req.options = reqOptions
        accessTokenAuth(req)
            .then(() => {
                next()
            })
            .catch(err => {
                return res.status(err.status).json({
                    message: err.message
                })
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
    }
    expressInitialize(config)

    // TODO: Remove this once frontend is stateless
    app.use(cookieSession({
        name: options.ssid
        , keys: [options.secret]
    }))
    app.use(cors({
        origin: 'http://localhost:5173'
        , credentials: true
        , optionsSuccessStatus: 200
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
