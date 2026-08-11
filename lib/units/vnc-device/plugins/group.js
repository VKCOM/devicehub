import events from 'events'
import Promise from 'bluebird'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import * as grouputil from '../../../util/grouputil.js'
import lifecycle from '../../../util/lifecycle.js'
import db from '../../../db/index.js'
import dbapi from '../../../db/api.js'
import * as apiutil from '../../../util/apiutil.js'
import solo from './solo.js'
import router from '../../base-device/support/router.js'
import transport from '../../base-device/support/transport.js'
import channels from '../../base-device/support/channels.js'
import {GroupMessage, AutoGroupMessage, UngroupMessage} from '../../../wire/wire.js'

export default syrup.serial()
    .dependency(solo)
    .dependency(router)
    .dependency(transport)
    .dependency(channels)
    .define(async(options, solo, router, transport, channels) => {
        const log = logger.createLogger('device:plugins:group')
        let currentGroup = null

        await db.connect()

        /** @type {any} */
        let plugin = new events.EventEmitter()

        plugin.get = Promise.method(() => {
            if (!currentGroup) {
                throw new grouputil.NoGroupError()
            }
            return currentGroup
        })

        plugin.join = (newGroup, timeout, usage) => {
            return plugin.get()
                .then(() => {
                    if (currentGroup.group !== newGroup.group) {
                        throw new grouputil.AlreadyGroupedError()
                    }

                    log.info('Update timeout for ', apiutil.QUARTER_MINUTES)
                    channels.updateTimeout(currentGroup.group, apiutil.QUARTER_MINUTES)

                    let newTimeout = channels.getTimeout(currentGroup.group)

                    dbapi.enhanceStatusChangedAt(options.serial, newTimeout).then(() => {
                        return currentGroup
                    })
                })
                .catch(grouputil.NoGroupError, () => {
                    currentGroup = newGroup

                    log.important('Now owned by "%s"', currentGroup.email)
                    log.important('Device now in group "%s"', currentGroup.name)
                    log.info('Rent time is ' + timeout)

                    channels.register(currentGroup.group, {
                        timeout: timeout || options.groupTimeout,
                        alias: solo.channel
                    })

                    dbapi.enhanceStatusChangedAt(options.serial, timeout)

                    transport.send([
                        wireutil.global,
                        wireutil.envelope(new wire.JoinGroupMessage(
                            options.serial
                            , currentGroup
                            , usage
                        ))
                    ])
                    plugin.emit('join', currentGroup)

                    return currentGroup
                })
        }

        plugin.keepalive = () => {
            if (currentGroup) {
                channels.keepalive(currentGroup.group)
            }
        }

        plugin.leave = (reason) => {
            return plugin.get()
                .then(group => {
                    log.important('No longer owned by "%s"', group.email)

                    channels.unregister(group.group)

                    transport.send([
                        wireutil.global,
                        wireutil.envelope(new wire.LeaveGroupMessage(
                            options.serial
                            , group
                            , reason
                        ))
                    ])

                    currentGroup = null
                    plugin.emit('leave', group)

                    return group
                })
        }

        router
            .on(GroupMessage, (channel, message) => {
                let reply = wireutil.reply(options.serial)
                Promise.method(() => {
                    return plugin.join(message.owner, message.timeout, message.usage)
                })()
                    .then(() =>{
                        transport.send([
                            channel,
                            reply.okay()
                        ])
                    })
                    .catch(grouputil.RequirementMismatchError, (err) => {
                        transport.send([
                            channel,
                            reply.fail(err.message)
                        ])
                    })
                    .catch(grouputil.AlreadyGroupedError, (err) => {
                        transport.send([
                            channel,
                            reply.fail(err.message)
                        ])
                    })
            })
            .on(AutoGroupMessage, (channel, message) => {
                return plugin.join(message.owner, message.timeout, message.identifier)
                    .then(() => {
                        plugin.emit('autojoin', message.identifier, true)
                    })
                    .catch(grouputil.AlreadyGroupedError, () => {
                        plugin.emit('autojoin', message.identifier, false)
                    })
            })
            .on(UngroupMessage, (channel, message) => {
                let reply = wireutil.reply(options.serial)
                Promise.method(() => {
                    return plugin.leave('ungroup_request')
                })()
                    .then(() => {
                        transport.send([
                            channel,
                            reply.okay()
                        ])
                    })
                    .catch(grouputil.NoGroupError, err => {
                        transport.send([
                            channel,
                            reply.fail(err.message)
                        ])
                    })
            })

        // @ts-ignore
        channels.on('timeout', channel => {
            if (currentGroup && channel === currentGroup.group) {
                plugin.leave('automatic_timeout')
            }
        })

        lifecycle.observe(() => {
            return plugin.leave('device_absent')
                .catch(grouputil.NoGroupError, () => true)
        })

        return plugin
    })
