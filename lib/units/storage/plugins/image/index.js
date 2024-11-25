import http from 'http'
import util from 'util'
import express from 'express'
import cors from 'cors'
import logger from '../../../../util/logger.js'
import * as requtil from '../../../../util/requtil.js'
import parseCrop from './param/crop.js'
import parseGravity from './param/gravity.js'
import get from './task/get.js'
import transform from './task/transform.js'
import rateLimitConfig from '../../../ratelimit/index.js'
import {accessTokenAuth} from '../../../api/helpers/securityHandlers.js'
import cookieSession from 'cookie-session'
import csrf from 'csurf'
export default (function(options) {
    var log = logger.createLogger('storage:plugins:image')
    var app = express()
    var server = http.createServer(app)
    // eslint-disable-next-line new-cap
    const route = express.Router()
    app.use(rateLimitConfig)
    app.use(cookieSession({
        name: options.ssid
        , keys: [options.secret]
    }))
    app.set('strict routing', true)
    app.set('case sensitive routing', true)
    app.set('trust proxy', true)
    app.use(csrf())
    app.use(cors({
        origin: 'http://localhost:5173'
        , credentials: true
        , optionsSuccessStatus: 200
    }))
    app.use(route)
    route.get('/s/image/:id/:name', requtil.limit(options.concurrency, function(req, res) {
        var orig = util.format('/s/blob/%s/%s', req.params.id, req.params.name)
        log.info('saving screenshot img', orig)
        return get(orig, options, req)
            .then(function(stream) {
                return transform(stream, {
                    crop: parseCrop(req.query.crop)
                    , gravity: parseGravity(req.query.gravity)
                })
            })
            .then(function(out) {
                res.status(200)
                if (typeof req.query.download !== 'undefined') {
                    res.set('Content-Disposition', 'attachment; filename="' + req.params['0'] + '"')
                }
                out.pipe(res)
            })
            .catch(function(err) {
                log.error('Unable to transform resource "%s"', req.params.id, err.stack)
                res.status(500)
                    .json({
                        success: false
                    })
            })
    }))
    server.listen(options.port)
    log.info('Listening on port %d', options.port)
})
