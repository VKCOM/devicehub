import oauth2 from '../../units/auth/oauth2/index.js'
export const command = 'auth-oauth2'
export const describe = 'Start an OAuth 2.0 auth unit.'
export const builder = function(yargs) {
    return yargs
        .env('STF_AUTH_OAUTH2')
        .strict()
        .option('app-url', {
            alias: 'a',
            describe: 'URL to the app unit.',
            type: 'string',
            demand: true
        })
        .option('oauth-authorization-url', {
            describe: 'OAuth 2.0 authorization URL.',
            type: 'string',
            default: process.env.OAUTH_AUTHORIZATION_URL,
            demand: true
        })
        .option('oauth-token-url', {
            describe: 'OAuth 2.0 token URL.',
            type: 'string',
            default: process.env.OAUTH_TOKEN_URL,
            demand: true
        })
        .option('oauth-userinfo-url', {
            describe: 'OAuth 2.0 user info URL.',
            type: 'string',
            default: process.env.OAUTH_USERINFO_URL,
            demand: true
        })
        .option('oauth-client-id', {
            describe: 'OAuth 2.0 client ID.',
            type: 'string',
            default: process.env.OAUTH_CLIENT_ID,
            demand: true
        })
        .option('oauth-client-secret', {
            describe: 'OAuth 2.0 client secret.',
            type: 'string',
            default: process.env.OAUTH_CLIENT_SECRET,
            demand: true
        })
        .option('oauth-callback-url', {
            describe: 'OAuth 2.0 callback URL.',
            type: 'string',
            default: process.env.OAUTH_CALLBACK_URL,
            demand: true
        })
        .option('oauth-scope', {
            describe: 'Space-separated OAuth 2.0 scope.',
            type: 'string',
            default: process.env.OAUTH_SCOPE,
            demand: true
        })
        .option('oauth-state', {
            describe: 'Whether to enable OAuth 2.0 state token support.',
            type: 'boolean',
            default: false
        })
        .option('oauth-domain', {
            describe: 'Optional email domain to allow authentication for.',
            type: 'string',
            default: process.env.OAUTH_DOMAIN,
            demand: false
        })
        .option('port', {
            alias: 'p',
            describe: 'The port to bind to.',
            type: 'number',
            default: process.env.PORT || 7120
        })
        .option('secret', {
            alias: 's',
            describe: 'The secret to use for auth JSON Web Tokens. Anyone who ' +
            'knows this token can freely enter the system if they want, so keep ' +
            'it safe.',
            type: 'string',
            default: process.env.SECRET,
            demand: true
        })
        .option('ssid', {
            alias: 'i',
            describe: 'The name of the session ID cookie.',
            type: 'string',
            default: process.env.SSID || 'ssid'
        })
        .option('support', {
            alias: 'sl',
            describe: 'url which needed to access support',
            type: 'string',
            default: 'example.com'
        })
        .option('docsUrl', {
            alias: 'du',
            describe: 'url which needed to access docs',
            type: 'string',
            default: 'example.com'
        })
        .epilog('Each option can be be overwritten with an environment variable ' +
        'by converting the option to uppercase, replacing dashes with ' +
        'underscores and prefixing it with `STF_AUTH_OAUTH2_` (e.g. ' +
        '`STF_AUTH_OAUTH2_SECRET`). Legacy environment variables like ' +
        'OAUTH_SCOPE are still accepted, too, but consider them ' +
        'deprecated.')
}
export const handler = function(argv) {
    return oauth2({
        port: argv.port,
        secret: argv.secret,
        ssid: argv.ssid,
        appUrl: argv.appUrl,
        domain: argv.oauthDomain,
        supportUrl: argv.support,
        docsUrl: argv.docsUrl,
        oauth: {
            authorizationURL: argv.oauthAuthorizationUrl,
            tokenURL: argv.oauthTokenUrl,
            userinfoURL: argv.oauthUserinfoUrl,
            clientID: argv.oauthClientId,
            clientSecret: argv.oauthClientSecret,
            callbackURL: argv.oauthCallbackUrl,
            scope: argv.oauthScope.split(/\s+/),
            state: argv.oauthState
        }
    })
}
