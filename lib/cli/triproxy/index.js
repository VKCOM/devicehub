import os from 'os'
import triproxy from '../../units/triproxy/index.js'
export const command = 'triproxy [name]'
export const describe = 'Start a triproxy unit.'
export const builder = function(yargs) {
    return yargs
        .env('STF_TRIPROXY')
        .strict()
        .option('bind-dealer', {
            alias: 'd',
            describe: 'The address to bind the ZeroMQ DEALER endpoint to.',
            type: 'string',
            default: 'tcp://*:7112'
        })
        .option('bind-pub', {
            alias: 'u',
            describe: 'The address to bind the ZeroMQ PUB endpoint to.',
            type: 'string',
            default: 'tcp://*:7111'
        })
        .option('bind-pull', {
            alias: 'p',
            describe: 'The address to bind the ZeroMQ PULL endpoint to.',
            type: 'string',
            default: 'tcp://*:7113'
        })
        .option('name', {
            describe: 'An easily identifiable name for log output.',
            type: 'string',
            default: os.hostname()
        })
        .epilog('Each option can be be overwritten with an environment variable ' +
        'by converting the option to uppercase, replacing dashes with ' +
        'underscores and prefixing it with `STF_TRIPROXY_` (e.g. ' +
        '`STF_TRIPROXY_BIND_PUB`).')
}
export const handler = function(argv) {
    return triproxy({
        name: argv.name,
        endpoints: {
            pub: argv.bindPub,
            dealer: argv.bindDealer,
            pull: argv.bindPull
        }
    })
}
