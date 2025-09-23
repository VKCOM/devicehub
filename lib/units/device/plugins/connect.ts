import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import {JoinGroupByAdbFingerprintMessage} from '../../../wire/wire.js'
import wireutil from '../../../wire/util.js'
import lifecycle from '../../../util/lifecycle.js'
import adb from '../support/adb.js'
import connector, {DEVICE_TYPE} from '../../base-device/support/connector.js'
import push from '../../base-device/support/push.js'
import router from '../../base-device/support/router.js'
import group from './group.js'
import solo from './solo.js'
import urlformat from '../../base-device/support/urlformat.js'
import identity from './util/identity.js'
import data from './util/data.js'
import type TcpUsbServer from '@u4/adbkit/dist/adb/tcpusb/server.d.ts'
import {AdbKeysUpdatedMessage} from '../../../wire/wire.js'

interface Key {
    fingerprint: string
    comment: string
}

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
    .define(async(options, adb, router, push, group, solo, urlformat, connector, identity, data) => {
        const log = logger.createLogger('device:plugins:connect')
        let activeServer: TcpUsbServer | null = null

        const notify = async(key: Key) => {
            try {
                const currentGroup = await group.get()
                push.send([
                    solo.channel,
                    wireutil.pack(JoinGroupByAdbFingerprintMessage, {
                        serial: options.serial,
                        fingerprint: key.fingerprint,
                        comment: key.comment,
                        currentGroup: currentGroup?.group
                    })
                ])
            }
            catch(e) {
                push.send([
                    solo.channel,
                    wireutil.pack(JoinGroupByAdbFingerprintMessage, {
                        serial: options.serial,
                        fingerprint: key.fingerprint,
                        comment: key.comment
                    })
                ])
            }
        }

        const plugin = {
            serial: options.serial,
            port: options.connectPort,
            url: urlformat(options.connectUrlPattern, options.connectPort, identity.model, data ? data.name.id : ''),
            auth: (key: Key): boolean => false,
            start: () => new Promise((resolve, reject) => {
                log.info('Starting connect plugin')

                // If Auth failed - the entire unit device will fall
                // TODO: fix
                const auth = (key: Key) => new Promise<void>(async(resolve, reject) => {
                    // TODO: Dangerous, discuss and remove
                    router.on(AdbKeysUpdatedMessage, () => notify(key))
                    await notify(key)

                    if (plugin.auth(key)) {
                        resolve()
                        return
                    }

                    // Connection rejected by user-defined auth handler
                    reject('Auth failed')
                })

                activeServer = adb.createTcpUsbBridge(plugin.serial, {auth})
                    .on('listening', () => resolve(plugin.url))
                    .on('error', reject)
                    .on('connection', conn => {
                        // @ts-ignore
                        log.info('New remote ADB connection from %s', conn.remoteAddress)
                        conn.on('userActivity', () => group.keepalive())
                    })

                activeServer!.listen(plugin.port)

                log.info(util.format('Listening on port %d', plugin.port))
                resolve(plugin.url)
            }),
            stop: async() => {
                if (!activeServer) {
                    return
                }

                log.info('Stop connect plugin')

                // TODO: Not ideal way, need WireRouter.once
                router.removeAllListeners(AdbKeysUpdatedMessage)

                const waitServerClose = new Promise<void>((resolve) => {
                    activeServer!.on('close', () => {
                        resolve()
                    })
                })

                activeServer.end()
                activeServer.close()
                await waitServerClose

                activeServer = null
            },
            end: async() => {
                if (connector.started && activeServer) {
                    activeServer.end()
                }
            }
        }

        group.on('join', (group, keys) =>
            plugin.auth = key => {
                if (keys?.length && !keys.includes(key.fingerprint)) {
                    log.error('Invalid RSA key. Somebody else took the device')
                    return false
                }
                return true
            }
        )

        group.on('autojoin', (id, joined) =>
            plugin.auth = key => {
                if (id === key.fingerprint && joined) {
                    return true
                }
                log.error('Device is already in use')
                return false
            }
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
            plugin.auth = (key) => false
        })
    })
