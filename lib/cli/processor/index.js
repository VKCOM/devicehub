import os from 'os'
import processor from '../../units/processor/index.js'
export const command = 'processor [name]'
export const describe = 'Start a processor unit.'
export const builder = function(yargs) {
    return yargs
        .env('STF_PROCESSOR')
        .strict()
        .option('connect-app-dealer', {
        alias: 'a'
        , describe: 'App-side ZeroMQ DEALER endpoint to connect to.'
        , array: true
        , demand: true
    })
        .option('connect-dev-dealer', {
        alias: 'd'
        , describe: 'Device-side ZeroMQ DEALER endpoint to connect to.'
        , array: true
        , demand: true
    })
        .option('name', {
        describe: 'An easily identifiable name for log output.'
        , type: 'string'
        , default: os.hostname()
    })
        .option('public-ip', {
        alias: 'pi'
        , description: 'Defined public ip for stf'
        , type: 'string'
        , default: 'localhost'
    })
        .epilog('Each option can be be overwritten with an environment variable ' +
        'by converting the option to uppercase, replacing dashes with ' +
        'underscores and prefixing it with `STF_PROCESSOR_` (e.g. ' +
        '`STF_PROCESSOR_CONNECT_APP_DEALER`).')
}
export const handler = function(argv) {
    return processor({
        name: argv.name
        , endpoints: {
            appDealer: argv.connectAppDealer
            , devDealer: argv.connectDevDealer
        }
        , publicIp: argv.publicIp
    })
}
