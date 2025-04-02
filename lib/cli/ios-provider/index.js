import path from 'path'
import provider from '../../units/ios-provider/index.js'
import {fork} from 'child_process'
import _ from 'lodash'
export const command = 'ios-provider [serial..]'
export const describe = 'Start an ios-provider unit.'
export const builder = function(yargs) {
    return yargs
        .strict()
        .env('STF_PROVIDER')
        .option('usbmux-path', {
            describe: 'Path to usbmux sock file. (note: doesnt do anything at the moment)'
            , type: 'string'
            , default: '/var/run/usbmuxd'
        })
        .option('wda-path', {
            describe: 'Full path for WebDriverAgent repository to build upon'
            , type: 'string'
            , default: null
        })
        // copied from cli/ios-device.js
        .option('boot-complete-timeout', {
            describe: 'How long to wait for boot to complete during device setup.'
            , type: 'number'
            , default: 60000
        })
        .option('cleanup', {
            describe: 'Attempt to reset the device between uses by uninstalling' +
            'apps, resetting accounts and clearing caches. Does not do a perfect ' +
            'job currently. Negate with --no-cleanup.'
            , type: 'boolean'
            , default: true
        })
        .option('port-range-min', {
            describe: 'Min port for forwarding to the ios device'
            , type: 'number'
            , default: 8100
        })
        .option('port-range-max', {
            describe: 'Max port for forwarding to the ios device'
            , type: 'number'
            , default: 8200
        })
        .option('screen-ws-range-min', {
            describe: 'Min port for screen websocket.'
            , type: 'number'
            , default: 18000
        })
        .option('screen-ws-range-max', {
            describe: 'Max port for screen websocket'
            , type: 'number'
            , default: 18100
        })
        .option('connect-push', {
            alias: 'p'
            , describe: 'ZeroMQ PULL endpoint to connect to.'
            , array: true
            , demand: true
        })
        .option('connect-sub', {
            alias: 's'
            , describe: 'ZeroMQ PUB endpoint to connect to.'
            , array: true
            , demand: true
        })
        .option('connect-url-pattern', {
            describe: 'The URL pattern to use for `adb connect`.'
            , type: 'string'
            , default: '${publicIp}:${publicPort}'
        })
        .option('group-timeout', {
            alias: 't'
            , describe: 'Timeout in seconds for automatic release of inactive devices.'
            , type: 'number'
            , default: 900
        })
        .option('heartbeat-interval', {
            describe: 'Send interval in milliseconds for heartbeat messages.'
            , type: 'number'
            , default: 10000
        })
        .option('lock-rotation', {
            describe: 'Whether to lock rotation when devices are being used. ' +
            'Otherwise changing device orientation may not always work due to ' +
            'sensitive sensors quickly or immediately reverting it back to the ' +
            'physical orientation.'
            , type: 'boolean'
        })
        .option('provider', {
            alias: 'n'
            , describe: 'Name of the provider.'
            , type: 'string'
            , demand: true
        })
        .option('public-ip', {
            describe: 'The IP or hostname to use in URLs.'
            , type: 'string'
            , demand: true
        })
        .option('screen-jpeg-quality', {
            describe: 'The JPG quality to use for the screen.'
            , type: 'number'
            , default: process.env.SCREEN_JPEG_QUALITY || 80
        })
        .option('screen-ping-interval', {
            describe: 'The interval at which to send ping messages to keep the ' +
            'screen WebSocket alive.'
            , type: 'number'
            , default: 30000
        })
        .option('screen-reset', {
            describe: 'Go back to home screen and reset screen rotation ' +
            'when user releases device. Negate with --no-screen-reset.'
            , type: 'boolean'
            , default: true
        })
        .option('screen-ws-url-pattern', {
            describe: 'The URL pattern to use for the screen WebSocket.'
            , type: 'string'
            , default: 'ws://${publicIp}:${publicPort}'
        })
        .option('storage-url', {
            alias: 'r'
            , describe: 'The URL to the storage unit.'
            , type: 'string'
            , demand: true
        })
        .option('connect-app-dealer', {
            describe: 'App-side ZeroMQ DEALER endpoint to connect to.'
            , array: true
            , demand: true
        })
        .option('connect-dev-dealer', {
            describe: 'Device-side ZeroMQ DEALER endpoint to connect to.'
            , array: true
            , demand: true
        })
        .option('host', {
            describe: 'Provider hostname.'
            , type: 'string'
            , demand: true
            , default: '127.0.0.1'
        })
}

/**
 * test
 * @param {any} argv arguments
 * @returns {Promise<void>} void
 */
export const handler = function(argv) {
    const cli = path.resolve(import.meta.dirname, '..')
    const allPorts = _.range(argv.portRangeMin, argv.portRangeMax)
    const [wdaPorts, screenWsPorts] = _.chunk(allPorts, Math.ceil(allPorts.length / 2))
    const screenListenPorts = _.range(argv.screenWsRangeMin, argv.screenWsRangeMax)
    return provider({
        name: argv.name
        , wdaPorts: wdaPorts
        , wdaPath: argv.wdaPathП
        , screenWsPorts: screenWsPorts
        , screenListenPorts: screenListenPorts
        , usbmuxPath: argv.usbmuxPath
        , filter: function(serial) {
            return argv.serial === undefined || argv.serial.length === 0 || argv.serial.indexOf(serial) !== -1
        }
        , fork: function(serial, opts) {
            var args = [

                'ios-device'
                , '--serial', serial
                , '--host', argv.host
                , '--screen-port', opts.screenListenPort
                , '--mjpeg-port', opts.screenPort
                , '--provider', argv.provider
                , '--public-ip', argv.publicIp
                , '--screen-ws-url-pattern', argv.screenWsUrlPattern
                , '--storage-url', argv.storageUrl
                , '--connect-app-dealer', argv.connectAppDealer
                , '--connect-dev-dealer', argv.connectDevDealer
                , '--wda-host', '127.0.0.1'
                , '--wda-port', opts.wdaPort
                ,]
                .concat(argv.connectSub.reduce(function(all, val) {
                    return all.concat(['--connect-sub', val])
                }, []))
                .concat(argv.connectPush.reduce(function(all, val) {
                    return all.concat(['--connect-push', val])
                }, []))
                .concat(opts.iMouseHidPath ? ['--imouse-hid-path', opts.iMouseHidPath] : [])
                // .concat(argv.lockRotation ? ['--lock-rotation'] : [])
                // .concat(!argv.cleanup ? ['--no-cleanup'] : [])
                // .concat(!argv.screenReset ? ['--no-screen-reset'] : [])
            return fork(cli, args)
        }
    })
}
