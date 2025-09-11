import syrup from '@devicefarmer/stf-syrup'
import logger from '../../util/logger.js'
import lifecycle from '../../util/lifecycle.js'
import logger$0 from '../base-device/support/logger.js'
import heartbeat from '../base-device/plugins/heartbeat.js'
import solo from '../base-device/plugins/solo.js'
import push from '../base-device/support/push.js'
import sub from '../base-device/support/sub.js'
import group from '../base-device/plugins/group.js'
import connect from './plugins/sdb/connect.js'
import sdb from './plugins/sdb/index.js'
import wireutil from '../../wire/util.js'
import wire from '../../wire/index.js'
import net from 'net'
import router from '../base-device/support/router.js'
import identity from './plugins/identity.js'
import launcher from './plugins/launcher.js'
import filesystem from './plugins/filesystem.js'

const log = logger.createLogger('tizen-device')
const isTcpPortOpen = (host, port, timeout = 2_000) => new Promise((resolve) => {
    const socket = net.createConnection({host, port, timeout}, () => {
        socket.end()
        resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.on('timeout', () => {
        socket.destroy()
        resolve(false)
    })
})


export default (async(options) => syrup.serial()
    .dependency(logger$0)
    .define(async(options) => {
        log.info('Preparing device')
        if (!await isTcpPortOpen(options.host, options.port)) {
            log.fatal('Error while preparing device: Device is unreachable')
            lifecycle.fatal()
        }

        return syrup.serial()
            .dependency(heartbeat)
            .dependency(solo)
            .dependency(push)
            .dependency(connect)
            .dependency(sub)
            .dependency(router)
            .dependency(sdb)
            .dependency(group)
            .dependency(identity)
            .dependency(launcher)
            .dependency(filesystem)
            .define(async(options, heartbeat, solo, push, connect, sub, router, sdb, group, identity, launcher, filesystem) => {
                try {
                    connect()

                    let listener
                    const waitRegister = Promise.race([
                        new Promise(resolve =>
                            router.on(wire.DeviceRegisteredMessage, listener = (...args) => resolve(args))
                        ),
                        new Promise(r => setTimeout(r, 15000))
                    ])

                    if (!await sdb.connect('127.0.0.1', options.connectPort)) {
                        throw new Error('SDB connection failed')
                    }

                    if (options.pingFrequency) {
                        let beatCounter = 0
                        heartbeat.on('beat', () => {
                            if (++beatCounter < options.pingFrequency) {
                                return
                            }
                            beatCounter = 0

                            sdb.ping()
                                .then(res => res ?
                                    log.info('Successfully ping device') :
                                    log.error('Failed ping device')
                                )
                                .catch(err => {
                                    log.fatal('Error while ping device', err)
                                    lifecycle.fatal()
                                })
                        })
                    }

                    await identity.collect()
                    await launcher.start()

                    const status = ['device', 'offline'].includes(identity.status) ? identity.status : 'device'

                    push.send([
                        wireutil.global,
                        wireutil.envelope(new wire.DeviceIntroductionMessage(
                            sdb.serial,
                            wireutil.toDeviceStatus(status),
                            new wire.ProviderMessage(solo.channel, options.provider)
                        ))
                    ])

                    if (!(await waitRegister)) {
                        throw new Error('Waiting device registration timeout')
                    }

                    // @ts-ignore
                    router.removeListener(wire.DeviceRegisteredMessage, listener)
                    listener = null

                    solo.poke()
                    filesystem()

                    if (process.send) {
                        process.send('ready')
                    }
                    log.info('Started')
                }
                catch (err) {
                    log.fatal(err)
                    lifecycle.fatal()
                }
            })
            .consume(options)
    })
    .consume(options)
)
