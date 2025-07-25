import tizenDevice from '../../units/tizen-device/index.js'
export const command = 'tizen-device'
export const describe = 'Start an tizen device unit.'
export const builder = function(yargs) {
    return yargs
        .strict()
        .option('device-name', {
            describe: 'Device name.'
        })
        .option('serial', {
            describe: 'The serial number of the device.',
            type: 'string',
            demand: true
        })
        .option('provider', {
            alias: 'n',
            describe: 'Name of the provider.',
            type: 'string',
            demand: true
        })
        .option('public-ip', {
            describe: 'The IP or hostname to use in URLs.',
            type: 'string',
            demand: true
        })
        .option('connect-push', {
            alias: 'p',
            describe: 'ZeroMQ PULL endpoint to connect to.',
            array: true,
            demand: true
        })
        .option('connect-sub', {
            alias: 's',
            describe: 'ZeroMQ PUB endpoint to connect to.',
            array: true,
            demand: true
        })
        .option('connect-app-dealer', {
            describe: 'App-side ZeroMQ DEALER endpoint to connect to.',
            array: true,
            demand: true
        })
        .option('connect-dev-dealer', {
            describe: 'Device-side ZeroMQ DEALER endpoint to connect to.',
            array: true,
            demand: true
        })
        .option('connect-push', {
            alias: 'p',
            describe: 'ZeroMQ PULL endpoint to connect to.',
            array: true,
            demand: true
        })
        .option('connect-sub', {
            alias: 's',
            describe: 'ZeroMQ PUB endpoint to connect to.',
            array: true,
            demand: true
        })
        .option('connect-url-pattern', {
            describe: 'Public WDA API URL pattern',
            type: 'string',
            default: '${publicIp}:${publicPort}'
        })
        .option('group-timeout', {
            alias: 't',
            describe: 'Timeout in seconds for automatic release of inactive devices.',
            type: 'number',
            default: 900
        })
        .option('heartbeat-interval', {
            describe: 'Send interval in milliseconds for heartbeat messages.',
            type: 'number',
            default: 10000
        })
        .option('provider', {
            alias: 'n',
            describe: 'Name of the provider.',
            type: 'string',
            demand: true
        })
        .option('public-ip', {
            describe: 'The IP or hostname to use in URLs.',
            type: 'string',
            demand: true
        })
        .option('connect-app-dealer', {
            describe: 'App-side ZeroMQ DEALER endpoint to connect to.',
            array: true,
            demand: true
        })
        .option('connect-dev-dealer', {
            describe: 'Device-side ZeroMQ DEALER endpoint to connect to.',
            array: true,
            demand: true
        })
        .option('device-host', {
            describe: 'Device host.',
            type: 'string',
            demand: true,
            default: '127.0.0.1'
        })
        .option('device-port', {
            describe: 'Device port',
            type: 'number',
            demand: true,
            default: 26101
        })
        .option('connect-port', {
            describe: 'Port allocated to sdb connections.',
            type: 'number',
            demand: true
        })
}
export const handler = function(argv) {
    return tizenDevice({
        serial: argv.serial,
        provider: argv.provider,
        publicIp: argv.publicIp,
        endpoints: {
            sub: argv.connectSub.filter(e => !!e.trim()),
            push: argv.connectPush.filter(e => !!e.trim()),
            appDealer: argv.connectAppDealer.filter(e => !!e.trim()),
            devDealer: argv.connectDevDealer.filter(e => !!e.trim())
        },
        groupTimeout: argv.groupTimeout * 1000,
        connectUrlPattern: argv.connectUrlPattern,
        heartbeatInterval: argv.heartbeatInterval,
        deviceName: argv.deviceName,
        host: argv.deviceHost,
        port: argv.devicePort,
        connectPort: argv.connectPort
    })
}
