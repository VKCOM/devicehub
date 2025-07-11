import logger from '../../util/logger.js'
import * as service from '../../util/serviceuser.js'
export const command = 'generate-service-user'
export const builder = function(yargs) {
    return yargs
        .strict()
        .option('admin', {
            alias: 'admin',
            describe: 'user need to be admin',
            type: 'boolean',
            default: false
        })
        .option('name', {
            alias: 'name',
            describe: 'display name for user',
            type: 'string'
        })
        .option('email', {
            alias: 'email',
            describe: 'email address',
            type: 'string'
        })
        .option('secret', {
            alias: 'secret',
            describe: 'secret used in tokens',
            type: 'string',
            default: 'kute kittykat' // this secret used in stf local run only lib/cli/local/index.js:58
        })
}
export const handler = function(argv) {
    const log = logger.createLogger('cli:generate-service-user')
    const admin = argv.admin
    const name = argv.name
    const email = argv.email
    const secret = argv.secret
    function next() {
        return service.generate(email, name, admin, secret).then(function(info) {
            log.info('Created service user ' + info.email + ' with token ' + info.token)
        })
    }
    return next()
        .then(function() {
            process.exit(0)
        })
        .catch(function(err) {
            log.fatal('Service user creation had an error:', err.stack)
            process.exit(1)
        })
}
