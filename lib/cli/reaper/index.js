import os from 'os'
import reaper from '../../units/reaper/index.js'
export const command = 'reaper [name]'
export const describe = 'Start a reaper unit.'
export const builder = function(yargs) {
    return yargs
        .env('STF_REAPER')
        .strict()
        .option('connect-push', {
            alias: 'p',
            describe: 'Device-side ZeroMQ PULL endpoint to connect to.',
            array: true,
            demand: true
        })
        .option('connect-sub', {
            alias: 's',
            describe: 'App-side ZeroMQ PUB endpoint to connect to.',
            array: true,
            demand: true
        })
        .option('heartbeat-timeout', {
            alias: 't',
            describe: 'Consider devices with heartbeat older than the timeout ' +
            'value dead. Given in milliseconds.',
            type: 'number',
            default: 30000
        })
        .option('name', {
            describe: 'An easily identifiable name for log output.',
            type: 'string',
            default: os.hostname()
        })
        .epilog('Each option can be be overwritten with an environment variable ' +
        'by converting the option to uppercase, replacing dashes with ' +
        'underscores and prefixing it with `STF_REAPER_` (e.g. ' +
        '`STF_REAPER_CONNECT_PUSH`).')
}
export const handler = function(argv) {
    return reaper({
        name: argv.name,
        heartbeatTimeout: argv.heartbeatTimeout,
        endpoints: {
            push: argv.connectPush,
            sub: argv.connectSub
        }
    })
}
