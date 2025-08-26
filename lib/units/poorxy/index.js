import http from 'http'
import express from 'express'
import httpProxy from 'http-proxy'
import logger from '../../util/logger.js'
export default (function(options) {
    let log = logger.createLogger('poorxy')
    let app = express()
    let server = http.createServer(app)
    let proxy = httpProxy.createProxyServer()
    proxy.on('error', function(err) {
        log.error('Proxy had an error', err.stack)
    })
    app.use(function(req, res, next) {
        res.setHeader('X-devicehub-unit', 'poorxy')
        next()
    })
    app.set('strict routing', true)
    app.set('case sensitive routing', true)
    app.set('trust proxy', true)
    app.get('/auth', function(req, res) {
        res.setHeader('X-Proxied-to', 'app-from-auth')
        proxy.web(req, res, {
            target: options.appUrl
        })
    });
    ['/static/auth/*', '/auth/*'].forEach(function(route) {
        app.all(route, function(req, res) {
            res.setHeader('X-Proxied-to', 'auth')
            proxy.web(req, res, {
                target: options.authUrl
            })
        })
    });
    ['/s/image/*'].forEach(function(route) {
        app.all(route, function(req, res) {
            proxy.web(req, res, {
                target: options.storagePluginImageUrl
            })
        })
    });
    ['/s/apk/*'].forEach(function(route) {
        app.all(route, function(req, res) {
            proxy.web(req, res, {
                target: options.storagePluginApkUrl
            })
        })
    });
    ['/s/*'].forEach(function(route) {
        app.all(route, function(req, res) {
            proxy.web(req, res, {
                target: options.storageUrl
            })
        })
    });
    ['/api/*'].forEach(function(route) {
        app.all(route, function(req, res) {
            proxy.web(req, res, {
                target: options.apiUrl
            })
        })
    })
    app.use(function(req, res) {
        res.setHeader('X-Proxied-to', 'app')
        proxy.web(req, res, {
            target: options.appUrl
        })
    })
    server.on('upgrade', (req, socket, head) => {
        proxy.ws(req, socket, head, {
            target: options.websocketUrl
        })
    })
    server.listen(options.port)
    log.info('Listening on port %d', options.port)
})
