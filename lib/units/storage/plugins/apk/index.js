import http from 'http'
import url from 'url'
import util from 'util'
import express from 'express'
import request from 'postman-request'
import logger from '../../../../util/logger.js'
import download from '../../../../util/download.js'
import manifest from './task/manifest.js'
import rateLimitConfig from '../../../ratelimit/index.js'
import {accessTokenAuth} from '../../../api/helpers/securityHandlers.js'
import cookieSession from 'cookie-session'
import csrf from 'csurf'
import * as apiutil from '../../../../util/apiutil.js'
export default (function(options) {
    var log = logger.createLogger('storage:plugins:apk')
    var app = express()
    var server = http.createServer(app)
    // eslint-disable-next-line new-cap
    const route = express.Router()
    log.info('cacheDir located at ' + options.cacheDir)
    app.use(rateLimitConfig)
    app.use(cookieSession({
        name: options.ssid
        , keys: [options.secret]
    }))
    app.use(csrf())
    app.use(route)
    app.set('strict routing', true)
    app.set('case sensitive routing', true)
    app.set('trust proxy', true)
    route.get('/s/apk/:id/:name/manifest', function(req, res) {
        var orig = util.format('/s/blob/%s/%s', req.params.id, req.params.name)
        let downloadUrl = url.resolve(options.storageUrl, orig)
        log.info(`Downloading apk from ${downloadUrl}`)
        download(downloadUrl, {
            dir: options.cacheDir
        }, req.headers)
            .then((file) => {
                log.info('Got apk from ' + downloadUrl + ' in ' + file.path)
                return manifest(file).then(data => {
                    res.status(200)
                        .json({
                            success: true
                            , manifest: data
                        })
                })
            })
            .catch(function(err) {
                log.error('Unable to read manifest of "%s"', req.params.id, err)
                res.status(400)
                    .json({
                        success: false
                    })
            })
    })
    route.get('/s/apk/:id/:name', function(req, res) {
        request(url.resolve(options.storageUrl, util.format('/s/blob/%s/%s', req.params.id, req.params.name)), {
            timeout: apiutil.INSTALL_APK_WAIT
            , pool: {maxSockets: Infinity}
            , headers: req.headers
        })
            .pipe(res)
    })
    server.listen(options.port)
    log.info('Listening on port %d', options.port)
})
