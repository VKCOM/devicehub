// @ts-nocheck
import http from 'http'
import url from 'url'
import openid from 'openid-client'
import express from 'express'
import cookieParser from 'cookie-parser'
import bodyParser from 'body-parser'
import logger from '../../util/logger.js'
import * as jwtutil from '../../util/jwtutil.js'
import * as pathutil from '../../util/pathutil.cjs'
import _ from 'lodash'
import rateLimitConfig from '../ratelimit/index.js'
export default (function(options) {
    const log = logger.createLogger('auth-openid')
    let app = express()
    let client
    const callbackPath = '/auth/openid/callback'
    const redirectUri = _.trimEnd(options.appUrl, '/') + callbackPath
    openid.Issuer.discover(options.openid.identifierUrl).then((keycloakIssuer) => {
        client = new keycloakIssuer.Client({
            client_id: options.openid.clientId,
            client_secret: options.openid.clientSecret,
            redirect_uris: [redirectUri],
            response_types: ['code'],
            state: Math.random().toString()
        })
    }).catch((err) => {
        log.error('Couldn\'t discover.')
        log.error(err)
        process.exit(1)
    })
    app.use(function(req, res, next) {
        res.setHeader('X-devicehub-unit', 'auth-openid')
        next()
    })
    app.use(rateLimitConfig)
    app.use(cookieParser())
    app.use(bodyParser.urlencoded({extended: false}))
    app.set('strict routing', true)
    app.set('case sensitive routing', true)

    function callbackHandler(req, res) {
        log.setLocalIdentifier(req.ip)
        log.info('res.status %s', res.status)
        let nonce = req.cookies['openid-nonce']
        if (!nonce) {
            log.error('Auth failed! Missed nonce')
            res.send('Missed openid-nonce')
            return
        }
        log.info('redirectUri %s', redirectUri)
        const params = client.callbackParams(req)
        client.callback(redirectUri, params, {nonce}).then((tokenSet) => {
            let claims = tokenSet.claims()
            log.info('claims %s', claims)
            let token = jwtutil.encode({
                payload: {
                    email: claims.email,
                    name: claims.username || claims.name
                },
                secret: options.secret
            })
            log.info('Authenticated "%s"', claims.email)
            res.redirect(url.format({
                pathname: '/',
                query: {jwt: token}
            }))
        })
    }
    app.post(callbackPath, callbackHandler)
    app.get(callbackPath, callbackHandler)
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
    app.get('/auth/*', (req, res) => {
        const nonce = openid.generators.nonce()
        // store the nonce in your framework's session mechanism, if it is a cookie based solution
        // it should be httpOnly (not readable by javascript) and encrypted.
        const url = client.authorizationUrl({
            scope: 'openid ' + options.openid.scopes,
            response_mode: 'form_post',
            nonce
        })
        res.cookie('openid-nonce', nonce, {
            httpOnly: true,
            sameSite: 'none',
            secure: true
        })
        res.redirect(url)
    })
    http.createServer(app).listen(options.port)
    log.info('Listening on port %d', options.port)
})
