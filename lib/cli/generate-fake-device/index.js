import db from '../../db/index.js'
import logger from '../../util/logger.js'
import * as fake from '../../util/fakedevice.js'

export const command = 'generate-fake-device <model>'

export const builder = function(yargs) {
    return yargs
        .strict()
        .option('number', {
            alias: 'n',
            describe: 'How many devices to create.',
            type: 'number',
            default: 1
        })
}
export const handler = async function(argv) {
    await db.connect()
    var log = logger.createLogger('cli:generate-fake-device')
    var n = argv.number
    function next() {
        return fake.generate(argv.model).then(function(serial) {
            log.info('Created fake device "%s"', serial)
            return --n ? next() : null
        })
    }
    return next()
        .then(function() {
            process.exit(0)
        })
        .catch(function(err) {
            log.fatal('Fake device creation had an error:', err.stack)
            process.exit(1)
        })
}
