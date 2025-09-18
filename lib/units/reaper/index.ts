import logger from '../../util/logger.js'
import wire from '../../wire/index.js'
import wireutil from '../../wire/util.js'
import {WireRouter} from '../../wire/router.js'
import lifecycle from '../../util/lifecycle.js'
import srv from '../../util/srv.js'
import TTLSet from '../../util/ttlset.js'
import * as zmqutil from '../../util/zmqutil.js'
import {runTransactionDev} from '../../wire/transmanager.js'

const log = logger.createLogger('reaper')

interface Options {
    heartbeatTimeout: number
    endpoints: {
        sub: string[]
        push: string[]
    }
}

export default (async(options: Options) => {
    const ttlset = new TTLSet(options.heartbeatTimeout)

    // Input
    const sub = zmqutil.socket('sub')
    await Promise.all(options.endpoints.sub.map((endpoint: string) =>
        srv.resolve(endpoint).then(records =>
            srv.attempt(records, (record) => {
                log.info('Receiving input from "%s"', record.url)
                sub.connect(record.url)
            })
        )
    )).catch((err) => {
        log.fatal('Unable to connect to sub endpoint %s', err?.message)
        lifecycle.fatal()
    })

    ;[wireutil.global].forEach(channel => {
        log.info('Subscribing to permanent channel "%s"', channel)
        sub.subscribe(channel)
    })

    // Output
    const push = zmqutil.socket('push')
    await Promise.all(options.endpoints.push.map((endpoint: string) =>
        srv.resolve(endpoint).then(records =>
            srv.attempt(records, (record) => {
                log.info('Sending output to "%s"', record.url)
                push.connect(record.url)
            })
        )
    )).catch((err) => {
        log.fatal('Unable to connect to push endpoint', err)
        lifecycle.fatal()
    })

    ttlset.on('insert', (serial) => {
        log.info('Device "%s" is present', serial)
        push.send([
            wireutil.global,
            wireutil.envelope(new wire.DevicePresentMessage(serial))
        ])
    })

    ttlset.on('drop', (serial) => {
        log.info('Reaping device "%s" due to heartbeat timeout', serial)
        push.send([
            wireutil.global,
            wireutil.envelope(new wire.DeviceAbsentMessage(serial))
        ])
    })

    lifecycle.observe(() => {
        [push, sub].forEach(sock => {
            try {
                sock.close()
            }
            catch (err: any) {
                // no-op
            }
        })
        ttlset.stop()
    })

    try {
        log.info('Reaping devices with no heartbeat')

        const router = new WireRouter()
            .on(wire.DeviceIntroductionMessage, (channel, message) => {
                ttlset.drop(message.serial, TTLSet.SILENT)
                ttlset.bump(message.serial, Date.now())
            })
            .on(wire.DeviceHeartbeatMessage, (channel, message) => {
                ttlset.bump(message.serial, Date.now())
            })
            .on(wire.DeviceAbsentMessage, (channel, message) => {
                ttlset.drop(message.serial, TTLSet.SILENT)
            })

        // Listen to changes
        sub.on('message', router.handler())

        // Load initial state
        const {devices} = await runTransactionDev(wireutil.global, new wire.GetPresentDevices(), {sub, push, router})

        const now = Date.now()
        devices.forEach((serial: string) => {
            ttlset.bump(serial, now, TTLSet.SILENT)
        })
    }
    catch (err: any) {
        log.fatal('Unable to load initial state: %s', err?.message)
        lifecycle.fatal()
    }
})
