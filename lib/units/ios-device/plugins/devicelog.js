import syrup from '@devicefarmer/stf-syrup'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import {spawn} from 'child_process'
import Promise from 'bluebird'
import dbapi from '../../../db/api.js'
import logger from '../../../util/logger.js'
import transport from '../../base-device/support/transport.js'
import router from '../../base-device/support/router.js'
import split from 'split'
import group from '../../base-device/plugins/group.js'
import nsyslogParser from 'nsyslog-parser'
import db from '../../../db/index.js'
import {LogcatStartMessage, LogcatStopMessage, GroupMessage} from '../../../wire/wire.js'

export default syrup.serial()
    .dependency(transport)
    .dependency(router)
    .dependency(group)
    .define(async function(options, transport, router, group) {
        const log = logger.createLogger('device:plugins:devicelog')

        await db.connect()

        class DeviceLogger {
            appOptions = {}
            channel = ''

            /** @type {import('child_process').ChildProcessWithoutNullStreams | null} */
            stream = null

            setChannel(channel) {
                this.channel = channel
            }

            async startLogging(channel) {
                this.setChannel(channel)
                try {
                    const realGroup = await group.get()

                    this.stream = spawn('idb', ['log', '--udid', options.serial])


                    this.stream.stdout.pipe(split(/\r*\n\x00*/)).on('data', line => {
                        if (!line) {
                            return
                        }
                        try {
                            const parsed = nsyslogParser(line)
                            const messagestr = parsed.message ?? ''
                            transport.send([
                                realGroup.group,
                                wireutil.envelope(new wire.DeviceLogcatEntryMessage(
                                    options.serial
                                    , Date.parse(parsed.ts) / 1000
                                    , parseInt(parsed.pid || '0', 10) || 0
                                    , 0
                                    , {
                                        Fatal: 7,
                                        Error: 6,
                                        Warning: 5,
                                        Default: 4,
                                        Activity: 3,
                                        Notice: 2
                                    }[messagestr.substring(1, messagestr.indexOf('>'))] ?? 1
                                    , parsed.appName ?? '*'
                                    , parsed.message || parsed.originalMessage
                                ))
                            ])
                        }
                        catch (err) {
                            // noop
                        }
                    })

                    this.stream.stderr.on('data', data => {
                        log.error('stderr from idb', data.toString())
                    })

                    this.stream.on('close', err => {
                        log.warn('Stream is closed', err)
                        this.killLoggingProcess()
                    })
                }
                catch (error) {
                    log.error('Error starting logging', error)
                }
            }

            killLoggingProcess() {
                if (this.stream) {
                    this.stream.kill()
                    this.stream = null
                    this.channel = ''
                }
            }
        }

        const deviceLogger = new DeviceLogger()

        group.on('leave', deviceLogger.killLoggingProcess)

        router
            .on(LogcatStartMessage, async function(channel, message) {
                const reply = wireutil.reply(options.serial)
                try {
                    await dbapi.loadDeviceBySerial(options.serial)
                    deviceLogger.startLogging(channel)
                    transport.send([channel, reply.okay('success')])
                }
                catch (error) {
                    log.error('Error loading device', error)
                    deviceLogger.killLoggingProcess()
                }
            })
            .on(LogcatStopMessage, function(channel, data) {
                const reply = wireutil.reply(options.serial)
                deviceLogger.killLoggingProcess()
                transport.send([channel, reply.okay('success')])
            })
            .on(GroupMessage, function(channel, data) {
                deviceLogger.channel = channel
            })

        return Promise.resolve()
    })
