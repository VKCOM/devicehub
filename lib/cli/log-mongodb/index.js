import logger from '../../util/logger.js'
import mongodb from '../../units/log/mongodb.js'
export const command = 'log-mongodb'
export const describe = 'Start a MongoDB log unit.'
export const builder = function(yargs) {
    return yargs
        .env('STF_LOG_MONGODB')
        .strict()
        .option('connect-sub', {
        alias: 's'
        , describe: 'App-side ZeroMQ PUB endpoint to connect to.'
        , array: true
        , demand: true
    })
        .option('priority', {
        alias: 'p'
        , describe: 'Minimum log level.'
        , type: 'number'
        , default: logger.Level.IMPORTANT
    })
        .epilog('Each option can be be overwritten with an environment variable ' +
        'by converting the option to uppercase, replacing dashes with ' +
        'underscores and prefixing it with `STF_LOG_MONGODB_` (e.g. ' +
        '`STF_LOG_MONGODB_PRIORITY`).')
}
export const handler = function(argv) {
    return mongodb({
        priority: argv.priority
        , endpoints: {
            sub: argv.connectSub
        }
    })
}
