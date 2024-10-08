import http from 'http'
import path from 'path'
import events from 'events'
import express from 'express'
// import * as swaggerExpress from 'swagger-express-mw-node12'
import {initialize as expressInitialize} from 'express-openapi'
// import * as swaggerUi from 'swagger-tools/middleware/swagger-ui.js'
import cookieSession from 'cookie-session'
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
export default (function(options) {
    var log = logger.createLogger('api')
    var app = express()
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
    var config = {
        app
        , basePath: '/api/v1'
        , appRoot: import.meta.dirname
        , exposeApiDocs: true
        , apiDoc: path.resolve(import.meta.dirname, 'swagger', 'api_v1.yaml')
        , paths: path.resolve(import.meta.dirname, 'paths')
        , securityHandlers: {accessTokenAuth}
        , logger: {
          debug: console.log
          , info: console.log
          , error: console.log
          , warn: console.log
        }
    }
    // swaggerExpress.create(config, function(err, swaggerExpress) {
    //     if (err) {
    //         throw err
    //     }
    //     app.use(swaggerUi(swaggerExpress.runner.swagger))
    //     swaggerExpress.register(app)
    // })
    expressInitialize(config)

    // Adding options in request, so that swagger controller
    // can use it.
    app.use(function(req, res, next) {
        var reqOptions = _.merge(options, {
            push: push
            , sub: sub
            , channelRouter: channelRouter
            , pushdev: pushdev
            , subdev: subdev
        })
        req.options = reqOptions
        next()
    })
    // TODO: Remove this once frontend is stateless
    app.use(cookieSession({
        name: options.ssid
        , keys: [options.secret]
    }))
    app.use(rateLimitConfig)
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
