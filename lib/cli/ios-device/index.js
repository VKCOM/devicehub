import iosDevice from '../../units/ios-device/index.js'
export const command = 'ios-device'
export const describe = 'Start an ios device provider.'
export const builder = function(yargs) {
    return yargs
        .strict()
        .option('boot-complete-timeout', {
            describe: 'How long to wait for boot to complete during device setup.',
            type: 'number',
            default: 60000
        })
        .option('cleanup', {
            describe: 'Attempt to reset the device between uses by uninstalling' +
            'apps, resetting accounts and clearing caches. Does not do a perfect ' +
            'job currently. Negate with --no-cleanup.',
            type: 'boolean',
            default: true
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
        .option('lock-rotation', {
            describe: 'Whether to lock rotation when devices are being used. ' +
            'Otherwise changing device orientation may not always work due to ' +
            'sensitive sensors quickly or immediately reverting it back to the ' +
            'physical orientation.',
            type: 'boolean'
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
        .option('screen-jpeg-quality', {
            describe: 'The JPG quality to use for the screen.',
            type: 'number',
            default: process.env.SCREEN_JPEG_QUALITY || 80
        })
        .option('screen-ping-interval', {
            describe: 'The interval at which to send ping messages to keep the ' +
            'screen WebSocket alive.',
            type: 'number',
            default: 30000
        })
        .option('screen-port', {
            describe: 'Port allocated to the screen WebSocket.',
            type: 'number',
            demand: true
        })
        .option('screen-reset', {
            describe: 'Go back to home screen and reset screen rotation ' +
            'when user releases device. Negate with --no-screen-reset.',
            type: 'boolean',
            default: true
        })
        .option('screen-ws-url-pattern', {
            describe: 'The URL pattern to use for the screen WebSocket.',
            type: 'string',
            default: 'ws://${publicIp}:${publicPort}'
        })
        .option('serial', {
            describe: 'The USB serial number of the device.',
            type: 'string',
            demand: true
        })
        .option('storage-url', {
            alias: 'r',
            describe: 'The URL to the storage unit.',
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
        .option('wda-path', {
            describe: 'Full path for WebDriverAgent repository to build upon',
            type: 'string',
            default: null
        })
        .option('wda-host', {
            describe: 'iOS device host ip address where WDA is started.',
            type: 'string',
            demand: true
        })
        .option('wda-port', {
            describe: 'The port the WDA should run et.',
            type: 'number',
            default: 8100
        })
        .option('mjpeg-port', {
            describe: 'The port the WDA mjpeg is started.',
            type: 'number',
            default: 9001,
            demand: true
        })
        .option('host', {
            describe: 'Provider hostname.',
            type: 'string',
            demand: true,
            default: '127.0.0.1'
        })
        .option('esp-32-path', {
            describe: 'Path to ESP32 serial device',
            type: 'string',
            default: null
        })
        .option('secret', {
            describe: 'The secret to use for auth JSON Web Tokens. Anyone who ' +
                'knows this token can freely enter the system if they want, so keep ' +
                'it safe.',
            type: 'string',
            default: process.env.SECRET || 'kute kittykat',
            demand: true
        })
        .option('connect-port', {
            describe: 'Port allocated to wda connections.',
            type: 'number',
            demand: true
        })
        .option('is-simulator', {
            describe: 'Define ios device type',
            type: 'boolean'
        })
}
export const handler = function(argv) {
    return iosDevice({
        serial: argv.serial,
        provider: argv.provider,
        publicIp: argv.publicIp,
        endpoints: {
            sub: argv.connectSub.filter(e => !!e.trim()),
            push: argv.connectPush.filter(e => !!e.trim()),
            appDealer: argv.connectAppDealer.filter(e => !!e.trim()),
            devDealer: argv.connectDevDealer.filter(e => !!e.trim())
        },
        groupTimeout: argv.groupTimeout * 1000, // change to ms
        storageUrl: argv.storageUrl,
        screenJpegQuality: argv.screenJpegQuality,
        screenPingInterval: argv.screenPingInterval,
        screenPort: argv.screenPort,
        screenWsUrlPattern: argv.screenWsUrlPattern,
        connectUrlPattern: argv.connectUrlPattern,
        wdaPath: argv.wdaPath,
        wdaHost: argv.wdaHost,
        wdaPort: argv.wdaPort,
        mjpegPort: argv.mjpegPort,
        heartbeatInterval: argv.heartbeatInterval,
        bootCompleteTimeout: argv.bootCompleteTimeout,
        lockRotation: argv.lockRotation,
        cleanup: argv.cleanup,
        screenReset: argv.screenReset,
        deviceName: argv.deviceName,
        host: argv.host,
        esp32Path: argv.esp32Path,
        secret: argv.secret,
        connectPort: argv.connectPort,
        isSimulator: argv.isSimulator
    })
}
