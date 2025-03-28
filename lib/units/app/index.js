import http from 'http'
import express from 'express'
import bodyParser from 'body-parser'
import serveStatic from 'serve-static'
import logger from '../../util/logger.js'
import * as pathutil from '../../util/pathutil.cjs'
import rateLimitConfig from '../ratelimit/index.js'
import * as markdownServe from 'markdown-serve'
export default (async function(options) {
    const log = logger.createLogger('app')
    let app = express()
    try {
        const Sentry = await import('@sentry/node')

        Sentry.setupExpressErrorHandler(app)
    }
    catch {
        log.error('Could not add sentry error handler')
    }
    app.use(function(req, res, next) {
        res.setHeader('X-devicehub-unit', 'app')
        next()
    })
    app.get('/debug-sentry', function mainHandler(req, res) {
        throw new Error('My first Sentry error!')
    })
    let server = http.createServer(app)
    app.use('/static/wiki', markdownServe.middleware({
        rootDirectory: pathutil.root('node_modules/@devicefarmer/stf-wiki')
        , view: 'docs'
    }))
    app.set('strict routing', true)
    app.set('case sensitive routing', true)
    app.set('trust proxy', true)
    app.use(rateLimitConfig)

    app.get('/auth', function(req, res) {
        res.redirect(options.authUrl)
    })
    app.use('/', serveStatic(pathutil.reactFrontend('dist'), {fallthrough: true}))
    app.use('/assets', serveStatic(pathutil.reactFrontend('dist/assets')))
    app.use('/locales', serveStatic(pathutil.reactFrontend('dist/locales')))

    app.get('/app/api/v1/auth_url', function(req, res) {
        res.send({
            authUrl: options.authUrl
        })
    })

    // This needs to be before the csrf() middleware or we'll get nasty
    // errors in the logs. The dummy endpoint is a hack used to enable
    // autocomplete on some text fields.
    app.all('/app/api/v1/dummy', function(req, res) {
        res.send('OK')
    })
    app.use(bodyParser.json())

    app.use((req, res, next) => {
        if (!req.path.includes('api')) {
            res.status(500).send('Frontend build not found in "ui" folder')
            return
        }
        next()
    })

    server.listen(options.port)
    log.info('Listening on port %d', options.port)
})
