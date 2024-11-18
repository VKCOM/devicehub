import http from 'http'
import openid from 'openid-client'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import bodyParser from 'body-parser'
import logger from '../../util/logger.js'
import * as jwtutil from '../../util/jwtutil.js'
import * as urlutil from '../../util/urlutil.js'
import rateLimitConfig from '../ratelimit/index.js'
export default (function(options) {
    const log = logger.createLogger('auth-openid')
    let app = express()
    let client
    const redirectUri = options.appUrl + 'auth/openid/callback'
    openid.Issuer.discover(options.openid.identifierUrl).then((keycloakIssuer) => {
        client = new keycloakIssuer.Client({
            client_id: options.openid.clientId
            , client_secret: options.openid.clientSecret
            , redirect_uris: [redirectUri]
            , response_types: ['code']
            , state: Math.random().toString()
        })
    }).catch((err) => {
        log.error('Couldn\'t discover.')
        log.error(err)
        process.exit(1)
    })
    app.use(rateLimitConfig)
    app.use(cookieParser())
    app.use(cors({
        origin: 'http://localhost:5173'
        , credentials: true
        , optionsSuccessStatus: 200
    }))
    app.use(bodyParser.urlencoded({extended: false}))
    app.set('strict routing', true)
    app.set('case sensitive routing', true)
    app.get('/', function(req, res) {
        res.redirect('/auth/openid/')
    })
    app.get('/auth/openid/', function(req, res) {
        const nonce = openid.generators.nonce()
        // store the nonce in your framework's session mechanism, if it is a cookie based solution
        // it should be httpOnly (not readable by javascript) and encrypted.
        if (client) {
            const url = client.authorizationUrl({
                scope: 'openid user_info'
                , response_mode: 'form_post'
                , nonce
            })
            res.cookie('openid-nonce', nonce, {
                httpOnly: true
                , sameSite: 'none'
                , secure: true
            })
            res.redirect(url)
        }
        else {
            res.redirect('/auth/openid/')
        }
    })
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
                    email: claims.email
                    , name: claims.username
                }
                , secret: options.secret
            })
            log.info('Authenticated "%s"', claims.email)
            res.redirect(urlutil.addParams(options.appUrl, {jwt: token}))
        })
    }
    app.post('/auth/openid/callback', callbackHandler)
    app.get('/auth/openid/callback', callbackHandler)
    app.get('/auth/contact', function(req, res) {
        res.status(200)
            .json({
                success: true
                , contactUrl: options.supportUrl
            })
    })
    app.get('/auth/docs', function(req, res) {
        res.status(200)
            .json({
                success: true
                , docsUrl: options.docsUrl
            })
    })
    http.createServer(app).listen(options.port)
    log.info('Listening on port %d', options.port)
})
