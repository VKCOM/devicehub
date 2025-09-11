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
import router from '../../base-device/support/router.js'
import group from './group.js'
import solo from './solo.js'
import urlformat from '../../base-device/support/urlformat.js'
import identity from './util/identity.js'
import data from './util/data.js'
import {GRPC_WAIT_TIMEOUT} from '../../../util/apiutil.js'

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

        const plugin = {
            serial: options.serial,
            port: options.connectPort,
            url: urlformat(options.connectUrlPattern, options.connectPort, identity.model, data ? data.name.id : ''),
            auth: (key, resolve, reject) => reject(),
            start: () => new Promise((resolve, reject) => {
                log.info('Starting connect plugin')

                const auth = key => promiseTimeout(new Promise((resolve, reject) => {
                    plugin.auth(key, resolve, reject)
                    router.on(wire.AdbKeysUpdatedMessage, () => notify(key))
                    notify(key)
                }), GRPC_WAIT_TIMEOUT) // reject after 2 minutes if autojoin event doesn't fire

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
                resolve(plugin.url)
            }),
            stop: async() => {
                if (!activeServer) {
                    return
                }

                log.info('Stop connect plugin')
                router.removeAllListeners(wire.AdbKeysUpdatedMessage)

                let resolveClose = () => {}

                const waitCloseServer = new Promise((resolve) => {
                    // @ts-ignore
                    resolveClose = resolve
                })

                activeServer.on('close', () => {
                    resolveClose()
                })

                activeServer.end()
                activeServer.close()
                await waitCloseServer

                activeServer = null
            },
            end: async() => {
                if (connector.started && activeServer) {
                    activeServer.end()
                }
            }
        }

        group.on('join', (g, id) =>
            plugin.auth = (key, resolve, reject) =>
                joinListener(g, id, key, resolve, reject)
        )
        group.on('autojoin', (id, joined) =>
            plugin.auth = (key, resolve, reject) =>
                autojoinListener(id, joined, key, resolve, reject)
        )

        connector.init({
            serial: options.serial,
            storageUrl: options.storageUrl,
            urlWithoutAdbPort: options.urlWithoutAdbPort,
            deviceType: DEVICE_TYPE.ANDROID,
            handlers: plugin
        })

        lifecycle.observe(() => connector.stop())
        group.on('leave', () => {
            connector.stop()
            plugin.auth = (key, resolve, reject) => reject()
        })
    })
