import os from 'os'
import processor from '../../units/processor/index.js'
export const command = 'processor [name]'
export const describe = 'Start a processor unit.'
export const builder = function(yargs) {
    return yargs
        .env('DH')
        .strict()
        .option('connect-proxy', {
            alias: 'p',
            describe: 'Proxy ZeroMQ DEALER endpoint to connect to.',
            array: true,
            demand: true
        })
        .option('bind-router', {
            alias: 'r',
            describe: 'The address to bind the device-facing ZeroMQ ROUTER endpoint to.',
            type: 'string',
            default: 'tcp://*:7160'
        })
        .option('name', {
            describe: 'An easily identifiable name for log output and the DEALER routing id.',
            type: 'string',
            default: os.hostname()
        })
        .option('heartbeat-timeout', {
            describe: 'How long to wait for a heartbeat (in milliseconds) until marking a device absent.',
            type: 'number',
            default: 30000
        })
        .option('public-ip', {
            alias: 'pi',
            describe: 'Defined public ip for stf',
            type: 'string',
            default: 'localhost'
        })
        .epilog('Each option can be be overwritten with an environment variable ' +
        'by converting the option to uppercase, replacing dashes with ' +
        'underscores and prefixing it with `DH_PROCESSOR_` (e.g. ' +
        '`DH_PROCESSOR_CONNECT_PROXY`).')
}
export const handler = function(argv) {
    return processor({
        name: argv.name,
        endpoints: {
            proxy: argv.connectProxy,
            deviceRouter: argv.bindRouter,
        },
        heartbeatTimeout: argv.heartbeatTimeout,
        publicIp: argv.publicIp
    })
}
