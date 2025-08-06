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
import wireutil from '../../wire/util.js'
import wire from '../../wire/index.js'
import net from 'net'
import router from '../base-device/support/router.js'

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
        const log = logger.createLogger('tizen-device')
        log.info('Preparing device')
        try {
            if (!await isTcpPortOpen(options.host, options.port)) {
                throw new Error('Device is unreachable')
            }

            return syrup.serial()
                .dependency(heartbeat)
                .dependency(solo)
                .dependency(push)
                .dependency(connect)
                .dependency(sub)
                .dependency(router)
                .dependency(group)
                .define(async(options, heartbeat, solo, push, connect, sub, router) => {
                    connect()

                    let listener
                    const waitRegister = Promise.race([
                        new Promise(resolve =>
                            router.on(wire.DeviceRegisteredMessage, listener = (...args) => resolve(args))
                        ),
                        new Promise(r => setTimeout(r, 15000))
                    ])

                    const serial = `${options.host}:${options.connectPort}`
                    push.send([
                        wireutil.global,
                        wireutil.envelope(new wire.DeviceIntroductionMessage(serial, wireutil.toDeviceStatus('device'), new wire.ProviderMessage(solo.channel, options.provider)))
                    ])

                    if (!(await waitRegister)) {
                        log.fatal('Waiting device registration timeout')
                        lifecycle.fatal()
                        return
                    }

                    // @ts-ignore
                    router.removeListener(wire.DeviceRegisteredMessage, listener)
                    listener = null

                    solo.poke()

                    if (process.send) {
                        process.send('ready')
                    }
                    log.info('Started')
                })
                .consume(options)
        }
        catch (/** @type {any} */err) {
            log.fatal('Error while preparing device: %s %s', err?.message || err, err?.stack)
            lifecycle.fatal()
        }
    })
    .consume(options)
)
