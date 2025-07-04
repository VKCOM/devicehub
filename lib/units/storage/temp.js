import http from 'http'
import util from 'util'
import path from 'path'
import crypto from 'crypto'
import express from 'express'
import validator from 'express-validator'
import bodyParser from 'body-parser'
import formidable from 'formidable'
import Promise from 'bluebird'
import cookieParser from 'cookie-parser'
import logger from '../../util/logger.js'
import Storage from '../../util/storage.js'
import * as requtil from '../../util/requtil.js'
import download from '../../util/download.js'
import bundletool from '../../util/bundletool.js'
import rateLimitConfig from '../ratelimit/index.js'
import {accessTokenAuth} from '../api/helpers/securityHandlers.js'
import cookieSession from 'cookie-session'
import db from '../../db/index.js'

export default (async function(options) {
    await db.connect()

    const log = logger.createLogger('storage:temp')
    const app = express()
    const server = http.createServer(app)
    const storage = new Storage()
    // eslint-disable-next-line new-cap
    const route = express.Router()
    app.set('strict routing', true)
    app.set('case sensitive routing', true)
    app.set('trust proxy', true)
    app.use(function(req, res, next) {
        res.setHeader('X-devicehub-unit', 'storage')
        next()
    })
    app.use(rateLimitConfig)
    app.use(cookieSession({
        name: options.ssid
        , keys: [options.secret]
    }))
    app.use(cookieParser())
    app.use(function(req, res, next) { // todo: create a proper auth middleware
        req.options = {
            secret: options.secret
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
                    res.status(err.status || 500)
                }
                res.json({message: err.message})
            })
    })
    app.use(bodyParser.json())
    app.use(validator())
    app.use(route)
    storage.on('timeout', function(id) {
        log.info('Cleaning up inactive resource "%s"', id)
    })
    route.post('/s/download/:plugin', function(req, res) {
        requtil.validate(req, function() {
            req.checkBody('url').notEmpty()
        })
            .then(function() {
                return download(req.body.url, {
                    dir: options.cacheDir
                    , jwt: req.internalJwt
                })
            })
            .then(function(file) {
                return {
                    id: storage.store(file)
                    , name: file.name
                }
            })
            .then(function(file) {
                var plugin = req.params.plugin
                res.status(201)
                    .json({
                        success: true
                        , resource: {
                            date: new Date()
                            , plugin: plugin
                            , id: file.id
                            , name: file.name
                            , href: util.format('/s/%s/%s%s', plugin, file.id, file.name ? util.format('/%s', path.basename(file.name)) : '')
                        }
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
            .catch(function(err) {
                log.error('Error storing resource', err.stack)
                res.status(500)
                    .json({
                        success: false
                        , error: 'ServerError'
                    })
            })
    })
    route.post('/s/upload/:plugin', function(req, res) {
        var form = new formidable.IncomingForm({
            maxFileSize: options.maxFileSize
        })
        if (options.saveDir) {
            form.uploadDir = options.saveDir
        }
        form.on('fileBegin', function(name, file) {
            if (/\.aab$/.test(file.name)) {
                file.isAab = true
            }
            var md5 = crypto.createHash('md5')
            file.name = md5.update(file.name).digest('hex')
        })
        Promise.promisify(form.parse, form)(req)
            .spread(function(fields, files) {
                return Object.keys(files).map(function(field) {
                    var file = files[field]
                    log.info('Uploaded "%s" to "%s"', file.name, file.path)
                    return {
                        field: field
                        , id: storage.store(file)
                        , name: file.name
                        , path: file.path
                        , isAab: file.isAab
                    }
                })
            })
            .then(function(storedFiles) {
                return Promise.all(storedFiles.map(function(file) {
                    return bundletool({
                        bundletoolPath: options.bundletoolPath
                        , keystore: options.keystore
                        , file: file
                    })
                })).then(function(storedFiles) {
                    res.status(201)
                        .json({
                            success: true
                            , resources: (function() {
                                var mapped = Object.create(null)
                                storedFiles.forEach(function(file) {
                                    var plugin = req.params.plugin
                                    mapped[file.field] = {
                                        date: new Date()
                                        , plugin: plugin
                                        , id: file.id
                                        , name: file.name
                                        , href: util.format('/s/%s/%s%s', plugin, file.id, file.name ?
                                            util.format('/%s', path.basename(file.name)) :
                                            '')
                                    }
                                })
                                return mapped
                            })()
                        })
                })
            })
            .catch(function(err) {
                log.error('Error storing resource', err.stack)
                res.status(500)
                    .json({
                        success: false
                        , error: 'ServerError'
                    })
            })
    })
    route.get('/s/blob/:id/:name', function(req, res) {
        var file = storage.retrieve(req.params.id)
        if (file) {
            if (typeof req.query.download !== 'undefined') {
                res.set('Content-Disposition', 'attachment; filename="' + path.basename(file.name) + '"')
            }
            res.set('Content-Type', file.type)
            res.sendFile(file.path)
        }
        else {
            res.sendStatus(404)
        }
    })
    server.listen(options.port)
    log.info('Listening on port %d', options.port)
})
