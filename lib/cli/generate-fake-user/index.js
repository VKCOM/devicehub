import logger from '../../util/logger.js'
import * as fake from '../../util/fakeuser.js'
export const command = 'generate-fake-user'
export const builder = function(yargs) {
    return yargs
        .strict()
        .option('n', {
        alias: 'number'
        , describe: 'How many users to create.'
        , type: 'number'
        , default: 1
    })
}
export const handler = function(argv) {
    var log = logger.createLogger('cli:generate-fake-user')
    var n = argv.number
    function next() {
        return fake.generate().then(function(email) {
            log.info('Created fake user "%s"', email)
            return --n ? next() : null
        })
    }
    return next()
        .then(function() {
        process.exit(0)
    })
        .catch(function(err) {
        log.fatal('Fake user creation had an error:', err.stack)
        process.exit(1)
    })
}
