import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import lifecycle from '../../../util/lifecycle.js'
import db from '../../../db/index.js'
import adb from '../support/adb.js'
import connector, {DEVICE_TYPE} from '../../base-device/support/connector.js'
import push from '../../base-device/support/push.js'
import router from '../../base-device/support/push.js'
import group from './group.js'
import solo from './solo.js'
import urlformat from '../../base-device/support/urlformat.js'
import identity from './util/identity.js'
import data from './util/data.js'

// The promise passed as an argument will not be cancelled after the time has elapsed,
// only the second promise will be rejected.
const promiseTimeout = (promise, ms, message = 'Timeout exceeded') => Promise.race([
    promise,
    new Promise((_, reject) => {
        const id = setTimeout(() => reject(new Error(message)), ms)
        promise.finally(() => clearTimeout(id))
    })
])

export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(push)
    .dependency(group)
    .dependency(solo)
    .dependency(urlformat)
    .dependency(connector)
    .dependency(identity)
    .dependency(data)
    .define(async function(options, adb, router, push, group, solo, urlformat, connector, identity, data) {
        const log = logger.createLogger('device:plugins:connect')
        let activeServer = null

        await db.connect()

        const notify = async(key) => {
            try {
                const currentGroup = group.get()
                push.send([
                    solo.channel,
                    wireutil.envelope(new wire.JoinGroupByAdbFingerprintMessage(options.serial, key.fingerprint, key.comment, currentGroup.group))
                ])
            }
            catch(e) {
                push.send([
                    solo.channel,
                    wireutil.envelope(new wire.JoinGroupByAdbFingerprintMessage(options.serial, key.fingerprint, key.comment))
                ])
            }
        }

        const joinListener = (_, identifier, key, reject) => {
            if (identifier !== key.fingerprint) {
                reject(new Error('Somebody else took the device'))
            }
        }

        const autojoinListener = (identifier, joined, key, resolve, reject) => {
            if (identifier === key.fingerprint) {
                if (joined) {
                    return resolve()
                }
                reject(new Error('Device is already in use'))
            }
        }

        const auth = key => promiseTimeout(new Promise((resolve, reject) => {
            group.on('join', (g, id) =>
                joinListener(g, id, key, reject)
            )
            group.on('autojoin', (id, joined) =>
                autojoinListener(id, joined, key, resolve, reject)
            )
            router.on(wire.AdbKeysUpdatedMessage, () => notify(key))
            notify(key)
        }), 120_000) // reject after 2 minutes if autojoin event doesn't fire

        const plugin = {
            serial: options.serial,
            port: options.connectPort,
            url: urlformat(options.connectUrlPattern, options.connectPort, identity.model, data ? data.name.id : ''),
            start: () => new Promise((resolve, reject) => {
                log.info('Starting connect plugin')

                activeServer = adb.createTcpUsbBridge(plugin.serial, {auth})
                    .on('listening', () => resolve(plugin.url))
                    .on('error', reject)
                    .on('connection', conn => {
                        // @ts-ignore
                        log.info('New remote ADB connection from %s', conn.remoteAddress)
                        conn.on('userActivity', () => group.keepalive())
                    })

                activeServer.listen(plugin.port)
                lifecycle.share('Remote ADB', activeServer)

                log.info(util.format('Listening on port %d', plugin.port))
            }),
            stop: async() => {
                if (connector.started && activeServer) {
                    activeServer.close()
                    activeServer.end()
                    activeServer = null
                }
            },
            end: async() => {
                if (connector.started && activeServer) {
                    activeServer.end()
                }
            }
        }

        connector.init({
            serial: options.serial,
            storageUrl: options.storageUrl,
            urlWithoutAdbPort: options.urlWithoutAdbPort,
            deviceType: DEVICE_TYPE.ANDROID,
            handlers: plugin
        })

        lifecycle.observe(plugin.stop)
        group.on('leave', plugin.stop)
    })
