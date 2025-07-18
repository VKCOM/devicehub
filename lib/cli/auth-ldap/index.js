import ldap from '../../units/auth/ldap.js'
export const command = 'auth-ldap'
export const describe = 'Start an LDAP auth unit.'
export const builder = function(yargs) {
    return yargs
        .env('STF_AUTH_LDAP')
        .strict()
        .option('app-url', {
            alias: 'a',
            describe: 'URL to the app unit.',
            type: 'string',
            demand: true
        })
        .option('ldap-bind-credentials', {
            describe: 'LDAP bind credentials.',
            type: 'string',
            default: process.env.LDAP_BIND_CREDENTIALS
        })
        .option('ldap-bind-dn', {
            describe: 'LDAP bind DN.',
            type: 'string',
            default: process.env.LDAP_BIND_DN
        })
        .option('ldap-search-class', {
            describe: 'LDAP search objectClass.',
            type: 'string',
            default: process.env.LDAP_SEARCH_CLASS || 'top'
        })
        .option('ldap-search-dn', {
            describe: 'LDAP search DN.',
            type: 'string',
            default: process.env.LDAP_SEARCH_DN,
            demand: true
        })
        .option('ldap-search-field', {
            describe: 'LDAP search field.',
            type: 'string',
            default: process.env.LDAP_SEARCH_FIELD,
            demand: true
        })
        .option('ldap-search-scope', {
            describe: 'LDAP search scope.',
            type: 'string',
            default: process.env.LDAP_SEARCH_SCOPE || 'sub'
        })
        .option('ldap-search-filter', {
            describe: 'LDAP search filter.',
            type: 'string',
            default: process.env.LDAP_SEARCH_FILTER
        })
        .option('ldap-timeout', {
            alias: 't',
            describe: 'LDAP timeout.',
            type: 'number',
            default: process.env.LDAP_TIMEOUT || 1000
        })
        .option('ldap-url', {
            alias: 'u',
            describe: 'URL to the LDAP server (e.g. `ldap://127.0.0.1`).',
            type: 'string',
            default: process.env.LDAP_URL,
            demand: true
        })
        .option('ldap-username-field', {
            describe: 'LDAP username field.',
            type: 'string',
            default: process.env.LDAP_USERNAME_FIELD || 'cn',
            demand: true
        })
        .option('ldap-privilege-mapping', {
            describe: 'LDAP group to privilege mapping in JSON format (e.g. \'{"admin_group":"admin","user_group":"user"}\').',
            type: 'string',
            default: process.env.LDAP_PRIVILEGE_MAPPING || '{}'
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
            type: 'string'
        })
        .option('docsUrl', {
            alias: 'du',
            describe: 'url which needed to access docs',
            type: 'string'
        })
        .epilog('Each option can be be overwritten with an environment variable ' +
        'by converting the option to uppercase, replacing dashes with ' +
        'underscores and prefixing it with `STF_AUTH_LDAP_` (e.g. ' +
        '`STF_AUTH_LDAP_SECRET`). Legacy environment variables like ' +
        'LDAP_USERNAME_FIELD are still accepted, too, but consider them ' +
        'deprecated.')
}
export const handler = function(argv) {
    return ldap({
        port: argv.port,
        secret: argv.secret,
        ssid: argv.ssid,
        appUrl: argv.appUrl,
        supportUrl: argv.support,
        docsUrl: argv.docsUrl,
        ldap: {
            url: argv.ldapUrl,
            timeout: argv.ldapTimeout,
            bind: {
                dn: argv.ldapBindDn,
                credentials: argv.ldapBindCredentials
            },
            search: {
                dn: argv.ldapSearchDn,
                scope: argv.ldapSearchScope,
                objectClass: argv.ldapSearchClass,
                field: argv.ldapSearchField,
                filter: argv.ldapSearchFilter
            },
            username: {
                field: argv.ldapUsernameField
            },
            privilegeMapping: argv.ldapPrivilegeMapping ? JSON.parse(argv.ldapPrivilegeMapping) : {}
        }
    })
}
