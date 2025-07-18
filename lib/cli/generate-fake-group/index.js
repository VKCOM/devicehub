import logger from '../../util/logger.js'
import * as fake from '../../util/fakegroup.js'
export const command = 'generate-fake-group'
export const builder = function(yargs) {
    return yargs
        .strict()
        .option('n', {
            alias: 'number',
            describe: 'How many groups to create.',
            type: 'number',
            default: 1
        })
}
export const handler = function(argv) {
    var log = logger.createLogger('cli:generate-fake-group')
    var n = argv.number
    function next() {
        return fake.generate().then(function(email) {
            log.info('Created fake group "%s"', email)
            return --n ? next() : null
        })
    }
    return next()
        .then(function() {
            process.exit(0)
        })
        .catch(function(err) {
            log.fatal('Fake group creation had an error:', err.stack)
            process.exit(1)
        })
}
