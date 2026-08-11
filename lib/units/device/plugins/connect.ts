import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import lifecycle from '../../../util/lifecycle.js'
import * as streamutil from '../../../util/streamutil.js'
import adb from '../support/adb.js'
import connector, {DEVICE_TYPE} from '../../base-device/support/connector.js'
import transport from '../../base-device/support/transport.js'
import router from '../../base-device/support/router.js'
import group from './group.js'
import solo from './solo.js'
import urlformat from '../../base-device/support/urlformat.js'
import identity from './util/identity.js'
import data from './util/data.js'
import minirev from '../resources/minirev.js'
import type TcpUsbServer from '@u4/adbkit/dist/adb/tcpusb/server.d.ts'
import {AdbKeysUpdatedMessage} from '../../../wire/wire.js'
import {attachReverse, type ReverseSession} from './adb-reverse/session.ts'

interface Key {
    fingerprint: string
    comment: string
}

export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(transport)
    .dependency(group)
    .dependency(solo)
    .dependency(urlformat)
    .dependency(connector)
    .dependency(identity)
    .dependency(data)
    .dependency(minirev)
    .define(async(options, adb, router, transport, group, solo, urlformat, connector, identity, data, minirev) => {
        const log = logger.createLogger('device:plugins:connect')
        let activeServer: TcpUsbServer | null = null
        const activeSessions = new Set<ReverseSession>()
        // Set to true before deliberate minirev kill so the stream-end
        // listener doesn't trigger lifecycle.fatal().
        let stoppingMinirev = false

        // Launch the minirev binary on the device and wait until its abstract
        // socket is ready to accept connections. Mirrors what the former
        // forward plugin did in startService() + awaitServer().
        async function startMinirev(): Promise<void> {
            stoppingMinirev = false
            log.info('Launching minirev service')
            const out = await adb.getDevice(options.serial).shell(['exec', minirev.bin])
            // Don't use lifecycle.share — it would fatal on deliberate stop().
            // Instead watch for unexpected termination only.
            streamutil.talk(log, 'Minirev says: "%s"', out)
            out.on('end', () => {
                if (!stoppingMinirev && !lifecycle.ending) {
                    log.fatal('Minirev shell ended we shall share its fate')
                    lifecycle.fatal()
                }
            })
            out.on('error', (err: Error) => {
                if (!stoppingMinirev && !lifecycle.ending) {
                    log.fatal('Minirev shell error: %s', err?.message || err)
                    lifecycle.fatal()
                }
            })
        }

        async function awaitMinirev(times = 5, delay = 100): Promise<void> {
            log.info('Waiting for minirev socket')
            try {
                const conn = await adb.getDevice(options.serial).openLocal('localabstract:minirev')
                conn.end()
            } catch (err: any) {
                if (/closed/.test(err.message) && times > 1) {
                    await new Promise(r => setTimeout(r, delay))
                    return awaitMinirev(times - 1, delay * 2)
                }
                throw err
            }
        }

        const plugin = {
            serial: options.serial,
            port: options.connectPort,
            url: urlformat(options.connectUrlPattern, options.connectPort, identity.model, data ? data.name.id : ''),
            auth: (key: Key): boolean => false,
            start: async() => {
                log.info('Starting connect plugin')

                await startMinirev()
                await awaitMinirev()

                return new Promise((resolve, reject) => {
                    // If Auth failed - the entire unit device will fall
                    // TODO: fix
                    const auth = (key: Key) => new Promise<void>(async(resolve, reject) => {
                        if (plugin.auth(key)) {
                            resolve()
                            return
                        }
                        reject('Auth failed')
                    })

                    activeServer = adb.createTcpUsbBridge(plugin.serial, {auth})
                        .on('listening', () => resolve(plugin.url))
                        .on('error', reject)
                        .on('connection', conn => {
                            // @ts-ignore
                            log.info('New remote ADB connection from %s', conn.remoteAddress)
                            conn.on('userActivity', () => group.keepalive())

                            const openMinirev = async(devicePort: number) => {
                                const conn = await adb.getDevice(plugin.serial).openLocal('localabstract:minirev')
                                const header = Buffer.alloc(4)
                                header.writeUInt16LE(0, 0)
                                header.writeUInt16LE(devicePort, 2)
                                conn.write(header)
                                return conn as unknown as import('./adb-reverse/session.ts').MinirevStream
                            }

                            const session: ReverseSession = attachReverse(conn as never, openMinirev)
                            activeSessions.add(session)

                            conn.on('end', () => {
                                session.end()
                                activeSessions.delete(session)
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

                // Kill minirev on device so the next session can bind the
                // abstract socket without "Address already in use".
                stoppingMinirev = true
                await minirev.stop().catch((err: any) => {
                    log.warn('Failed to stop minirev: %s', err?.message || err)
                })
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

        group.on('leave', () => {
            for (const session of activeSessions) {
                session.end()
            }
            activeSessions.clear()
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
            connector.stop()
            plugin.auth = (key) => false
        })
    })
