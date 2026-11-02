import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import lifecycle from '../../../util/lifecycle.js'
import adb from '../support/adb.js'
import connector, {DEVICE_TYPE} from '../../base-device/support/connector.js'
import transport from '../../base-device/support/transport.js'
import group from './group.js'
import solo from './solo.js'
import urlformat from '../../base-device/support/urlformat.js'
import identity from './util/identity.js'
import data from './util/data.js'
import reverseHelper from '../resources/reverse.js'
import type {OpenReverse} from './adb-bridge/reverse/session.ts'
import type {ReverseDevice} from './adb-bridge/reverse/stream.ts'
import {HelperForward, HELPER_SOCKET} from './adb-bridge/reverse/helper.ts'
import {createProvider} from './adb-bridge/provider.ts'
import {BridgeServer} from './adb-bridge/server.ts'
import type {AdbPublicKey, BridgeConnection} from './adb-bridge/connection.ts'

type Key = Pick<AdbPublicKey, 'fingerprint' | 'comment'>

export default syrup.serial()
    .dependency(adb)
    .dependency(transport)
    .dependency(group)
    .dependency(solo)
    .dependency(urlformat)
    .dependency(connector)
    .dependency(identity)
    .dependency(data)
    .dependency(reverseHelper)
    .define(async(options, adb, transport, group, solo, urlformat, connector, identity, data, reverseHelper) => {
        const log = logger.createLogger('device:plugins:connect')
        let activeServer: BridgeServer | null = null
        const activeConnections = new Set<BridgeConnection>()
        // The device-side reverse helper's `adb shell` stream while it runs;
        // ending it stops the helper
        let helper: {stop(): void} | null = null

        // Numbers each launch, so one that finishes after a stop is not kept
        let helperRun = 0
        let helperReady: Promise<void> | null = null

        // The helper serves nothing but `adb reverse`, so when it dies only the
        // reverse forwards go (each one's control stream ends with it, see HelperForward),
        // and the next `adb reverse` starts it again. It must not take
        // the user's adb connection, the screen and the device down.
        async function startHelper(): Promise<void> {
            log.info('Starting reverse helper')
            const run = ++helperRun
            const out = await reverseHelper.start()
            if (run !== helperRun) {
                out.end()
                out.destroy()
                throw new Error('Remote connect stopped while the reverse helper was starting')
            }
            let stopping = false
            const lost = () => {
                if (helper !== current) {
                    return
                }
                helper = null
                helperReady = null
                if (!stopping && !lifecycle.ending) {
                    log.error('Reverse helper exited; reverse forwards are gone until the next one')
                }
            }
            const current = {
                stop: () => {
                    stopping = true
                    out.end()
                    out.destroy()
                }
            }
            helper = current
            out.on('end', lost)
            out.on('close', lost)
        }

        function ensureHelper(): Promise<void> {
            helperReady ??= startHelper().catch(err => {
                helperReady = null
                throw err
            })
            return helperReady
        }

        function stopHelper(): void {
            helperRun++
            helperReady = null
            helper?.stop()
            helper = null
        }

        // A new stream to the helper's socket, through the provider's adb server
        const openHelperStream = async(): Promise<ReverseDevice> =>
            await adb.getDevice(options.serial).openLocal(`localabstract:${HELPER_SOCKET}`) as unknown as ReverseDevice

        // One `adb reverse` binding: the helper listens on devicePort and every
        // connection to it comes back as a stream of its own
        const openReverse: OpenReverse = async(devicePort, accept, lost) => {
            await ensureHelper()
            return HelperForward.listen(openHelperStream, devicePort, accept, lost)
        }

        // Forward streams, the banner and the device's adbd features, through
        // the provider's adb server
        const provider = createProvider(adb, options.serial)
        const {openService, banner, features} = provider

        const plugin = {
            serial: options.serial,
            port: options.connectPort,
            url: options.connectUrl ||
                urlformat(options.connectUrlPattern, options.connectPort, identity.model, data ? data.name.id : ''),
            auth: (key: Key): boolean => false,
            start: async() => {
                log.info('Starting connect plugin')

                return new Promise((resolve, reject) => {
                    const auth = async(key: Key) => {
                        if (!plugin.auth(key)) throw new Error('ADB key is not allowed for the current owner')
                    }

                    activeServer = new BridgeServer({auth, banner, features, openService, openReverse})
                        .on('listening', () => resolve(plugin.url))
                        .on('error', (err: Error) => {
                            log.warn('Remote ADB bridge error: %s', err.message)
                            reject(err)
                        })
                        .on('connection', (conn: BridgeConnection) => {
                            log.info('New remote ADB connection from %s', conn.remoteAddress)
                            conn.on('userActivity', () => group.keepalive())
                            activeConnections.add(conn)

                            conn.on('end', (reason?: unknown) => {
                                if (reason) {
                                    log.warn('Closing remote ADB connection: %s', reason instanceof Error ? reason.message : String(reason))
                                }
                                activeConnections.delete(conn)
                            })
                        })

                    activeServer!.listen(plugin.port)
                    log.info(util.format('Listening on port %d', plugin.port))
                })
            },
            stop: async() => {
                if (!activeServer) {
                    return
                }

                log.info('Stop connect plugin')

                const waitServerClose = new Promise<void>((resolve) => {
                    activeServer!.on('close', () => {
                        resolve()
                    })
                })

                activeServer.end()
                activeServer.close()
                await waitServerClose

                activeServer = null

                // Every forward went with its connection; the helper has nothing
                // left to serve until the next `adb reverse`
                stopHelper()
                // Nor will anybody open a stream until the next start
                provider.release()
            },
            end: async() => {
                if (connector.started && activeServer) {
                    activeServer.end()
                }
            }
        }

        const setAllowedKeys = (keys: string[] = []) => {
            plugin.auth = key => {
                if (keys.length && !keys.includes(key.fingerprint)) {
                    log.warn('Remote ADB key is not allowed for the current owner')
                    return false
                }
                return true
            }
        }
        group.on('join', e => setAllowedKeys(e.adbKeys))

        group.on('leave', () => {
            for (const conn of activeConnections) {
                conn.reverse.end()
            }
        })

        connector.init({
            serial: options.serial,
            storageUrl: options.storageUrl,
            urlWithoutAdbPort: options.urlWithoutAdbPort,
            deviceType: DEVICE_TYPE.ANDROID,
            handlers: plugin
        })

        lifecycle.observe(() => connector.stop())
        group.on('leave', () => {
            plugin.auth = (key) => false
            return connector.stop()
        })
    })
