import vncDevice from '../../units/vnc-device/index.js'
export const command = 'vnc-device'

export const describe = 'Start an vnc device provider.'


export function builder(yargs) {
    return yargs
        .strict()
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
            describe: 'The URL pattern to use for `adb connect`.',
            type: 'string',
            default: '${publicIp}:${connectPort}'
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
        .option('vnc-port', {
            describe: 'The port where vnc is started.',
            type: 'number',
            default: 9001,
            demand: true
        })
        .option('device-url', {
            describe: 'url for device',
            type: 'string',
            default: '127.0.0.1',
            demand: true
        })
        .option('device-name', {
            describe: 'Device name',
            type: 'string',
            default: 'Generic VNC Device'
        })
        .option('device-os', {
            describe: 'Device os',
            type: 'string',
            default: 'VNC Device'
        })
        .option('device-password', {
            describe: 'device password',
            type: 'string',
            default: 'Password'
        })
        .option('device-type', {
            describe: 'device type',
            type: 'string',
            default: 'VNC'
        })
        .option('host', {
            describe: 'Provider hostname.',
            type: 'string',
            demand: true,
            default: '127.0.0.1'
        })
}

export function handler(argv) {
    return vncDevice({
        serial: argv.serial,
        provider: argv.provider,
        publicIp: argv.publicIp,
        endpoints: {
            sub: argv.connectSub,
            push: argv.connectPush,
            appDealer: argv.connectAppDealer,
            devDealer: argv.connectDevDealer
        },
        groupTimeout: argv.groupTimeout * 1000, // change to ms
        storageUrl: argv.storageUrl,
        screenJpegQuality: argv.screenJpegQuality,
        screenPingInterval: argv.screenPingInterval,
        screenPort: argv.screenPort,
        screenWsUrlPattern: argv.screenWsUrlPattern,
        connectUrlPattern: argv.connectUrlPattern,
        mjpegPort: argv.vncPort,
        deviceUrl: argv.deviceUrl,
        deviceOs: argv.deviceOs,
        devicePassword: argv.devicePassword,
        deviceType: argv.deviceType,
        heartbeatInterval: argv.heartbeatInterval,
        lockRotation: argv.lockRotation,
        cleanup: argv.cleanup,
        screenReset: argv.screenReset,
        deviceName: argv.deviceName,
        host: argv.host
    })
}
export default {
    command,
    describe,
    builder,
    handler
}
