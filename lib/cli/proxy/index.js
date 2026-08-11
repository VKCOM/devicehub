import os from 'os'
import proxy from '../../units/proxy/index.js'
export const command = 'proxy [name]'
export const describe = 'Start a proxy unit.'
export const builder = function(yargs) {
    return yargs
        .env('DH')
        .option('bind-router', {
            alias: 'r',
            describe: 'The address to bind the ZeroMQ ROUTER endpoint to.',
            type: 'string',
            default: 'tcp://*:7110'
        })
        .option('name', {
            describe: 'An easily identifiable name for log output.',
            type: 'string',
            default: os.hostname()
        })
        .epilog('Each option can be be overwritten with an environment variable ' +
        'by converting the option to uppercase, replacing dashes with ' +
        'underscores and prefixing it with `DH_PROXY_` (e.g. ' +
        '`DH_PROXY_BIND_ROUTER`).')
}
export const handler = function(argv) {
    return proxy({
        name: argv.name,
        endpoints: {
            router: argv.bindRouter
        }
    })
}
