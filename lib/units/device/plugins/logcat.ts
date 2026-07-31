import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wireutil from '../../../wire/util.js'
import lifecycle from '../../../util/lifecycle.js'
import adb from '../support/adb.js'
import router from '../../base-device/support/router.js'
import transport from '../../base-device/support/transport.js'
import group from './group.js'
import {
    DeviceLogcatEntryMessage,
    LogcatApplyFiltersMessage,
    LogcatStartMessage,
    LogcatStopMessage,
} from '../../../wire/wire.js'

export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(transport)
    .dependency(group)
    .define(function(options: any, adb: any, router: any, transport: any, group: any) {
        const log = logger.createLogger('device:plugins:logcat')

        let activeLogcat: any = null

        const isRunning = () => activeLogcat !== null

        function stop(): void {
            if (isRunning()) {
                log.info('Stopping logcat')
                activeLogcat.end()
                activeLogcat = null
            }
        }

        function reset(filters: Array<{tag: string, priority: number}>): void {
            if (!isRunning()) throw new Error('Logcat is not running')
            activeLogcat.resetFilters()
            if (filters.length) {
                activeLogcat.excludeAll()
                for (const f of filters) {
                    activeLogcat.include(f.tag, f.priority)
                }
            }
        }

        async function start(filters: Array<{tag: string, priority: number}>): Promise<void> {
            await group.get()
            stop()
            log.info('Starting logcat')
            activeLogcat = await adb.getDevice(options.serial).openLogcat({clear: true})
            activeLogcat.on('entry', (entry: any) => {
                try {
                    transport.send([
                        group.group,
                        wireutil.pack(DeviceLogcatEntryMessage, {
                            serial:   options.serial,
                            date:     entry.date.getTime() / 1000,
                            pid:      entry.pid      >>> 0,
                            tid:      entry.tid      >>> 0,
                            priority: entry.priority >>> 0,
                            tag:      entry.tag,
                            message:  entry.message,
                        }),
                    ])
                } catch (err: any) {
                    log.warn('Skipping malformed logcat entry: %s', err?.message)
                }
            })
            reset(filters)
        }

        lifecycle.observe(stop)
        group.on('leave', stop)

        router
            .on(LogcatStartMessage, (channel: string, message: any) => {
                const reply = wireutil.reply(options.serial)
                start(message.filters)
                    .then(() => transport.send([channel, reply.okay('success')]))
                    .catch((err: any) => {
                        log.error('Unable to open logcat: %s', err?.stack)
                        transport.send([channel, reply.fail('fail')])
                    })
            })
            .on(LogcatApplyFiltersMessage, (channel: string, message: any) => {
                const reply = wireutil.reply(options.serial)
                try {
                    reset(message.filters)
                    transport.send([channel, reply.okay('success')])
                } catch (err: any) {
                    log.error('Failed to apply logcat filters: %s', err?.stack)
                    transport.send([channel, reply.fail('fail')])
                }
            })
            .on(LogcatStopMessage, (channel: string) => {
                const reply = wireutil.reply(options.serial)
                try {
                    stop()
                    transport.send([channel, reply.okay('success')])
                } catch (err: any) {
                    log.error('Failed to stop logcat: %s', err?.stack)
                    transport.send([channel, reply.fail('fail')])
                }
            })
    })
