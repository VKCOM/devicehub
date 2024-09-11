const http = require('http')

<<<<<<< Updated upstream
var openid = require('openid')
var express = require('express')
var urljoin = require('url-join')

var logger = require('../../util/logger')
var jwtutil = require('../../util/jwtutil')
var urlutil = require('../../util/urlutil')

module.exports = function(options) {
  var extensions = [new openid.SimpleRegistration({
    email: true
  , fullname: true
  })]

  var relyingParty = new openid.RelyingParty(
    urljoin(options.appUrl, '/auth/openid/verify')
  , null // Realm (optional, specifies realm for OpenID authentication)
  , false // Use stateless verification
  , false // Strict mode
  , extensions)

  var log = logger.createLogger('auth-openid')
  var app = express()

=======
const openid = require('openid-client')
const express = require('express')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')

const logger = require('../../util/logger')
const jwtutil = require('../../util/jwtutil')
const urlutil = require('../../util/urlutil')
const rateLimitConfig = require('../ratelimit')

module.exports = function(options) {
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
  app.use(bodyParser.urlencoded({extended: false}))
>>>>>>> Stashed changes
  app.set('strict routing', true)
  app.set('case sensitive routing', true)

  app.get('/', function(req, res) {
    res.redirect('/auth/openid/')
  })

  app.get('/auth/openid/', function(req, res) {
<<<<<<< Updated upstream
    log.info('openid identifier url: %s', options.openid.identifierUrl)
    relyingParty.authenticate(options.openid.identifierUrl, false, function(err, authUrl) {
      if (err) {
        res.send('Authentication failed')
      }
      else if (!authUrl) {
        res.send('Authentication failed')
      }
      else {
        log.info('redirect to authUrl: %s', options.openid.identifierUrl)
        res.redirect(authUrl)
      }
    })
  })

  app.get('/auth/openid/verify', function(req, res) {
    log.setLocalIdentifier(req.ip)

    relyingParty.verifyAssertion(req, function(err, result) {
      log.info('openid verify assertion')
      if (err || !result.authenticated) {
        res.send('Authentication failed')
        return
      }
      var email = req.query['openid.sreg.email']
      var name = req.query['openid.sreg.fullname']
      log.info('Authenticated "%s:%s"', name, email)
      var token = jwtutil.encode({
        payload: {
          email: email
        , name: name
=======
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
    if(!nonce) {
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
>>>>>>> Stashed changes
        }
      , secret: options.secret
      })
      res.redirect(urlutil.addParams(options.appUrl, {jwt: token}))
    })
<<<<<<< Updated upstream
=======
  }

  app.post('/auth/openid/callback', callbackHandler)
  app.get('/auth/openid/callback', callbackHandler)

  app.get('/auth/contact', function(req, res) {
    res.status(200)
      .json({
        success: true
        , contactUrl: options.supportUrl
      })
>>>>>>> Stashed changes
  })

  http.createServer(app).listen(options.port)
  log.info('Listening on port %d', options.port)
}
