import os from 'os'
import util from 'util'
import path from 'path'
import Promise from 'bluebird'
import logger from '../../util/logger.js'
import * as procutil from '../../util/procutil.js'
export const command = 'local [serial..]'
export const describe = 'Start a complete local development environment.'
export const builder = function(yargs) {
    return yargs
        .env('STF_LOCAL')
        .strict()
        .option('adb-host', {
            describe: 'The ADB server host.',
            type: 'string',
            default: '127.0.0.1'
        })
        .option('adb-port', {
            describe: 'The ADB server port.',
            type: 'number',
            default: 5037
        })
        .option('ios-host', {
            describe: 'The Ios server host.',
            type: 'string',
            default: '127.0.0.1'
        })
        .option('ios-port', {
            describe: 'The Ios server port.',
            type: 'number',
            default: 5555
        })
        .option('allow-remote', {
            alias: 'R',
            describe: 'Whether to allow remote devices in STF. Highly ' +
            'unrecommended due to almost unbelievable slowness on the ADB side ' +
            'and duplicate device issues when used locally while having a ' +
            'cable connected at the same time.',
            type: 'boolean'
        })
        .option('api-port', {
            describe: 'The port the api unit should run at.',
            type: 'number',
            default: 7106
        })
        .option('app-port', {
            describe: 'The port the app unit should run at.',
            type: 'number',
            default: 7105
        })
        .option('app-url', {
            describe: 'Publicly accessible URL to the app unit.',
            type: 'string'
        })
        .option('auth-options', {
            describe: 'JSON array of options to pass to the auth unit.',
            type: 'string',
            default: '[]'
        })
        .option('auth-port', {
            describe: 'The port the auth unit should run at.',
            type: 'number',
            default: 7120
        })
        .option('auth-secret', {
            describe: 'The secret to use for auth JSON Web Tokens. Anyone who ' +
            'knows this token can freely enter the system if they want, so keep ' +
            'it safe.',
            type: 'string',
            default: process.env.SECRET || 'kute kittykat'
        })
        .option('auth-type', {
            describe: 'The type of auth unit to start.',
            type: 'string',
            choices: ['mock', 'ldap', 'oauth2', 'saml2', 'openid'],
            default: 'mock'
        })
        .option('auth-url', {
            alias: 'a',
            describe: 'URL to the auth unit.',
            type: 'string'
        })
        .option('bind-app-dealer', {
            describe: 'The address to bind the app-side ZeroMQ DEALER endpoint to.',
            type: 'string',
            default: 'tcp://127.0.0.1:7112'
        })
        .option('bind-app-pub', {
            describe: 'The address to bind the app-side ZeroMQ PUB endpoint to.',
            type: 'string',
            default: 'tcp://127.0.0.1:7111'
        })
        .option('bind-app-pull', {
            describe: 'The address to bind the app-side ZeroMQ PULL endpoint to.',
            type: 'string',
            default: 'tcp://127.0.0.1:7113'
        })
        .option('bind-dev-dealer', {
            describe: 'The address to bind the device-side ZeroMQ DEALER endpoint to.',
            type: 'string',
            default: 'tcp://127.0.0.1:7115'
        })
        .option('bind-dev-pub', {
            describe: 'The address to bind the device-side ZeroMQ PUB endpoint to.',
            type: 'string',
            default: 'tcp://127.0.0.1:7114'
        })
        .option('bind-dev-pull', {
            describe: 'The address to bind the device-side ZeroMQ PULL endpoint to.',
            type: 'string',
            default: 'tcp://127.0.0.1:7116'
        })
        .option('bind-ios-pub', {
            describe: 'The address to bind the app-side ZeroMQ PUB endpoint to.',
            type: 'string',
            default: 'tcp://127.0.0.1:7401'
        })
        .option('bind-ios-pull', {
            describe: 'The address to bind the app-side ZeroMQ PULL endpoint to.',
            type: 'string',
            default: 'tcp://127.0.0.1:7400'
        })
        .option('bind-temp-pull', {
            descrive: 'The address to bind the app-side ZeroMQ PULL endpoint to.',
            type: 'string',
            default: 'tcp://127.0.0.1:7116'
        })
        .option('bind-processor-pull', {
            descrive: 'The address to bind the app-side ZeroMQ PULL endpoint to.',
            type: 'string',
            default: 'tcp://127.0.0.1:7117'
        })
        .option('bind-temp-pub', {
            describe: 'The address to bind the app-side ZeroMQ PUB endpoint to.',
            type: 'string',
            default: 'tcp://127.0.0.1:7407'
        })
        .option('cleanup', {
            describe: 'Attempt to reset the device between uses by uninstalling' +
            'apps, resetting accounts and clearing caches. Does not do a perfect ' +
            'job currently. Negate with --no-cleanup.',
            type: 'boolean',
            default: true
        })
        .option('cleanup-disable-bluetooth', {
            describe: 'Whether to disable Bluetooth during cleanup.',
            type: 'boolean',
            default: false
        })
        .option('cleanup-bluetooth-bonds', {
            describe: 'Whether to remove Bluetooth bonds during cleanup.',
            type: 'boolean',
            default: false
        })
        .option('group-timeout', {
            alias: 't',
            describe: 'Timeout in seconds for automatic release of inactive devices.',
            type: 'number',
            default: 900
        })
        .option('lock-rotation', {
            describe: 'Whether to lock rotation when devices are being used. ' +
            'Otherwise changing device orientation may not always work due to ' +
            'sensitive sensors quickly or immediately reverting it back to the ' +
            'physical orientation.',
            type: 'boolean'
        })
        .option('mute-master', {
            describe: 'Whether to mute master volume.',
            choices: ['always', 'inuse', 'never'],
            default: 'never',
            coerce: val => {
                if (val === true) {
                    return 'inuse' // For backwards compatibility.
                }
                if (val === false) {
                    return 'never' // For backwards compatibility.
                }
                return val
            }
        })
        .option('port', {
            alias: ['p', 'poorxy-port'],
            describe: 'The port STF should run at.',
            type: 'number',
            default: 7100
        })
        .option('provider', {
            describe: 'An easily identifiable name for the UI and/or log output.',
            type: 'string',
            default: os.hostname()
        })
        .option('provider-ios', {
            describe: 'An easily identifiable name for the UI and/or log output.',
            type: 'string',
            default: `${os.hostname()}-ios`
        })
        .option('provider-max-port', {
            describe: 'Highest port number for device workers to use.',
            type: 'number',
            default: 7700
        })
        .option('provider-min-port', {
            describe: 'Lowest port number for device workers to use.',
            type: 'number',
            default: 7400
        })
        .option('public-ip', {
            describe: 'The IP or hostname to use in URLs.',
            type: 'string',
            default: 'localhost'
        })
        .option('screen-reset', {
            describe: 'Go back to home screen and reset screen rotation ' +
            'when user releases device. Negate with --no-screen-reset.',
            type: 'boolean',
            default: true
        })
        .option('screen-ws-url-pattern', {
            describe: 'Publicly accessible URL pattern to use for the screen WebSocket.',
            type: 'string',
            default: 'ws://${publicIp}:${publicPort}'
        })
        .option('serial', {
            describe: 'Only use devices with these serial numbers.',
            type: 'array'
        })
        .option('storage-options', {
            describe: 'JSON array of options to pass to the storage unit.',
            type: 'string',
            default: '[]'
        })
        .option('storage-plugin-apk-port', {
            describe: 'The port the storage-plugin-apk unit should run at.',
            type: 'number',
            default: 7104
        })
        .option('storage-plugin-image-port', {
            describe: 'The port the storage-plugin-image unit should run at.',
            type: 'number',
            default: 7103
        })
        .option('storage-port', {
            describe: 'The port the storage unit should run at.',
            type: 'number',
            default: 7102
        })
        .option('storage-type', {
            describe: 'The type of storage unit to start.',
            type: 'string',
            choices: ['temp', 's3'],
            default: 'temp'
        })
        .option('user-profile-url', {
            describe: 'URL to external user profile page',
            type: 'string'
        })
        .option('vnc-initial-size', {
            describe: 'The initial size to use for the experimental VNC server.',
            type: 'string',
            default: '600x800',
            coerce: function(val) {
                return val.split('x').map(Number)
            }
        })
        .option('websocket-port', {
            describe: 'The port the websocket unit should run at.',
            type: 'number',
            default: 7110
        })
        .option('need-scrcpy', {
            describe: 'Need using Scrcpy instead Minicap for screenshots.',
            type: 'boolean',
            default: false
        })
        .option('wda-host', {
            describe: 'iOS device host ip address where WDA is started.',
            type: 'string',
            default: '192.168.88.78'
        })
        .option('wda-port', {
            describe: 'The port the WDA should run et.',
            type: 'number',
            default: 20001
        })
        .option('mjpeg-port', {
            describe: 'The port the WDA mjpeg is started.',
            type: 'number',
            default: 20002
        })
        .option('udid-storage', {
            describe: 'The path for ip information of devoces',
            type: 'string',
            default: false
        })
        .option('websocket-url', {
            describe: 'Publicly accessible URL to the websocket unit.',
            type: 'string'
        })
        .option('url-without-adb-port', {
            describe: 'If there isnt adbPort in DB use baseUrl.',
            type: 'boolean',
            default: true
        })
        .epilog('Each option can be be overwritten with an environment variable ' +
        'by converting the option to uppercase, replacing dashes with ' +
        'underscores and prefixing it with `STF_LOCAL_` (e.g. ' +
        '`STF_LOCAL_ALLOW_REMOTE`).')
}
export const handler = function(argv) {
    var log = logger.createLogger('cli:local')
    // Each forked process waits for signals to stop, and so we run over the
    // default limit of 10. So, it's not a leak, but a refactor wouldn't hurt.
    process.setMaxListeners(20)
    const __filename = import.meta.dirname
    const stages = [
        [ // stage 0
            [
                'migrate'
            ]
        ],
        [ // stage 1
            [ // app triproxy
                'triproxy', 'app001',
                '--bind-pub', argv.bindAppPub,
                '--bind-dealer', argv.bindAppDealer,
                '--bind-pull', argv.bindAppPull
            ],
            [ // device triproxy
                'triproxy', 'dev001',
                '--bind-pub', argv.bindDevPub,
                '--bind-dealer', argv.bindDevDealer,
                '--bind-pull', argv.bindDevPull
            ]
        ],
        [ // stage 2
            [ // processor one
                'processor', 'proc001',
                '--connect-app-dealer', argv.bindAppDealer,
                '--connect-dev-dealer', argv.bindDevDealer,
                '--connect-push', argv.bindAppPull,
                '--connect-push-dev', argv.bindDevPull,
                '--connect-sub', argv.bindAppPub,
                '--connect-sub-dev', argv.bindDevPub,
                '--public-ip', argv.publicIp
            ],
            [ // reaper one
                'reaper', 'reaper001',
                '--connect-push', argv.bindDevPull,
                '--connect-sub', argv.bindAppPub
            ],
            [ // provider
                'provider',
                '--name', argv.provider,
                '--min-port', argv.providerMinPort,
                '--max-port', argv.providerMaxPort,
                '--connect-sub', argv.bindDevPub,
                '--connect-push', argv.bindDevPull,
                '--group-timeout', argv.groupTimeout,
                '--public-ip', argv.publicIp,
                '--storage-url',
                util.format('http://localhost:%d/', argv.port),
                '--adb-host', argv.adbHost,
                '--adb-port', argv.adbPort,
                '--vnc-initial-size', argv.vncInitialSize.join('x'),
                '--mute-master', argv.muteMaster,
                '--need-scrcpy', argv.needScrcpy,
                '--screen-ws-url-pattern', argv.screenWsUrlPattern,
                '--url-without-adb-port', argv.urlWithoutAdbPort,
                '--secret', argv.authSecret
            ]
                .concat(argv.allowRemote ? ['--allow-remote'] : [])
                .concat(argv.lockRotation ? ['--lock-rotation'] : [])
                .concat(!argv.cleanup ? ['--no-cleanup'] : [])
                .concat(argv.cleanupDisableBluetooth ? ['--cleanup-disable-bluetooth'] : [])
                .concat(argv.cleanupBluetoothBonds ? ['--cleanup-bluetooth-bonds'] : [])
                .concat(!argv.screenReset ? ['--no-screen-reset'] : [])
                .concat(argv.serial ?? []),
            [ // auth
                util.format('auth-%s', argv.authType),
                '--port', argv.authPort,
                '--secret', argv.authSecret,
                '--app-url', argv.appUrl || util.format('http://%s:%d/', argv.publicIp, argv.port)
            ].concat(JSON.parse(argv.authOptions)),
            [ // app
                'app',
                '--port', argv.appPort,
                '--secret', argv.authSecret,
                '--auth-url', argv.authUrl || util.format('http://%s:%d/auth/%s/', argv.publicIp, argv.port, {
                    oauth2: 'oauth',
                    saml2: 'saml'
                }[argv.authType] || argv.authType),
                '--websocket-url', argv.websocketUrl || util.format('http://%s:%d/', argv.publicIp, argv.websocketPort)
            ].concat((function() {
                var extra = []
                if (argv.userProfileUrl) {
                    extra.push('--user-profile-url', argv.userProfileUrl)
                }
                return extra
            })()),
            [ // api
                'api',
                '--port', argv.apiPort,
                '--secret', argv.authSecret,
                '--connect-push', argv.bindAppPull,
                '--connect-sub', argv.bindAppPub,
                '--connect-push-dev', argv.bindDevPull,
                '--connect-sub-dev', argv.bindDevPub,
                '--storage-url',
                util.format('http://localhost:%d', argv.port)
            ],
            [ // groups engine
                'groups-engine',
                '--connect-push', argv.bindAppPull,
                '--connect-sub', argv.bindAppPub,
                '--connect-push-dev', argv.bindDevPull,
                '--connect-sub-dev', argv.bindDevPub
            ],
            [ // websocket
                'websocket',
                '--port', argv.websocketPort,
                '--secret', argv.authSecret,
                '--storage-url',
                util.format('http://localhost:%d/', argv.port),
                '--connect-push', argv.bindAppPull,
                '--connect-push-dev', argv.bindDevPull,
                '--connect-sub', argv.bindAppPub,
                '--connect-sub-dev', argv.bindDevPub
            ],
            [ // storage
                util.format('storage-%s', argv.storageType),
                '--port', argv.storagePort,
                '--secret', argv.authSecret,
                '--connect-push', argv.bindTempPull,
                '--connect-sub', argv.bindTempPub
            ].concat(JSON.parse(argv.storageOptions)),
            [ // image processor
                'storage-plugin-image',
                '--port', argv.storagePluginImagePort,
                '--storage-url',
                util.format('http://localhost:%d/', argv.port),
                '--secret', argv.authSecret
            ],
            [ // apk processor
                'storage-plugin-apk',
                '--port', argv.storagePluginApkPort,
                '--storage-url',
                util.format('http://localhost:%d/', argv.port),
                '--secret', argv.authSecret
            ]
        ],
        [ // stage 3
            [ // poorxy
                'poorxy',
                '--port', argv.port,
                '--app-url',
                util.format('http://localhost:%d/', argv.appPort),
                '--auth-url',
                util.format('http://localhost:%d/', argv.authPort),
                '--api-url',
                util.format('http://localhost:%d/', argv.apiPort),
                '--websocket-url',
                util.format('http://localhost:%d/', argv.websocketPort),
                '--storage-url',
                util.format('http://localhost:%d/', argv.storagePort),
                '--storage-plugin-image-url',
                util.format('http://localhost:%d/', argv.storagePluginImagePort),
                '--storage-plugin-apk-url',
                util.format('http://localhost:%d/', argv.storagePluginApkPort)
            ]
        ]
    ]
    async function run() {
        let procs = []
        function shutdown() {
            log.info('Shutting down all child processes')
            return Promise.all(
                procs.map(proc => proc.cancel().catch(() => {}))
            )
        }
        for (const stage of stages) {
            const forks = stage.map((args) => procutil.fork(path.join(__filename, '../index.js'), args))
            procs.push(...forks)
            await Promise.all(forks).timeout(5000).catch(Promise.TimeoutError, () => {
                log.info('Timeout exceded, moving on to next stage')
            }).catch((err) => {
                log.fatal('Child process had an error', err.stack)
                return shutdown()
                    .then(function() {
                        process.exit(1)
                    })
            })
        }
        process.on('SIGINT', function() {
            log.info('Received SIGINT, waiting for processes to terminate')
        })
        process.on('SIGTERM', function() {
            log.info('Received SIGTERM, waiting for processes to terminate')
        })
        return Promise.all(procs)
            .then(function() {
                process.exit(0)
            })
            .catch(function(err) {
                log.fatal('Child process had an error', err.stack)
                return shutdown()
                    .then(function() {
                        process.exit(1)
                    })
            })
    }
    run()
}
