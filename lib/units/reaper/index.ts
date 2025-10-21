import logger from '../../util/logger.js'
import {
    DeleteDevice,
    DeviceAbsentMessage,
    DeviceHeartbeatMessage,
    DeviceIntroductionMessage, DevicePresentMessage, GetDeadDevices,
    GetPresentDevices
} from '../../wire/wire.js'
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
    timeToDeviceCleanup: number // in minutes
    deviceCleanupInterval: number // in minutes
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
        log.fatal('Unable to connect to push endpoint: %s', err?.message)
        lifecycle.fatal()
    })

    ttlset.on('insert', (serial) => {
        log.info('Device "%s" is present', serial)
        push.send([
            wireutil.global,
            wireutil.pack(DevicePresentMessage, {serial})
        ])
    })

    ttlset.on('drop', (serial) => {
        log.info('Reaping device "%s" due to heartbeat timeout', serial)
        push.send([
            wireutil.global,
            wireutil.pack(DeviceAbsentMessage, {serial})
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

    const router = new WireRouter()
        .on(DeviceIntroductionMessage, (channel, message) => {
            ttlset.drop(message.serial, TTLSet.SILENT)
            ttlset.bump(message.serial, Date.now())
        })
        .on(DeviceHeartbeatMessage, (channel, message) => {
            ttlset.bump(message.serial, Date.now())
        })
        .on(DeviceAbsentMessage, (channel, message) => {
            ttlset.drop(message.serial, TTLSet.SILENT)
        })

    if (options.timeToDeviceCleanup) {
        log.info('deviceCleanerLoop enabled')

        // This functionality is implemented in the Reaper unit because this unit cannot be replicated
        const deviceCleanerLoop = () => setTimeout(async() => {
            log.info('Checking dead devices [interval: %s]', options.deviceCleanupInterval)
            try {
                const absenceDuration = options.timeToDeviceCleanup
                const {deadDevices} = await runTransactionDev(wireutil.global, GetDeadDevices, {
                    time: options.timeToDeviceCleanup * 60 * 1000
                }, {sub, push, router})

                for (const {serial, present} of deadDevices) {
                    if (present) {
                        continue
                    }

                    log.info( // @ts-ignore
                        'Removing a dead device [serial: %s, absence_duration: %.1f %s]',
                        serial,
                        ... (
                            absenceDuration >= 60 // if more 1 hour
                                ? [absenceDuration / 60, 'hrs']
                                : [absenceDuration, 'min']
                        )
                    )

                    push.send([
                        wireutil.global,
                        wireutil.pack(DeleteDevice, {serial})
                    ])
                }
            } catch (err: any) {
                log.error('Dead device check failed with error: %s', err?.message)
            } finally {
                deviceCleanerLoop()
            }
        }, options.deviceCleanupInterval * 60 * 1000)

        deviceCleanerLoop()
    }

    const init = async() => {
        try {
            log.info('Reaping devices with no heartbeat')

            // Listen to changes
            sub.on('message', router.handler())

            // Load initial state
            const {devices} = await runTransactionDev(wireutil.global, GetPresentDevices, {}, {sub, push, router})

            const now = Date.now()
            devices?.forEach((serial: string) => {
                ttlset.bump(serial, now, TTLSet.SILENT)
            })
        }
        catch (err: any) {
            if (err?.message === 'Timeout when running transaction') {
                log.error('Load initial state error: Timeout when running transaction, retry')
                setTimeout(init, 2000)
                return
            }
            log.fatal('Unable to load initial state: %s', err?.message)
            lifecycle.fatal()
        }
    }

    init()
})
