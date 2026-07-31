import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import {
    GroupMessage,
    JoinGroupMessage,
    LeaveGroupMessage,
    UngroupMessage
} from '../../../wire/wire.js'
import wireutil from '../../../wire/util.js'
import * as grouputil from '../../../util/grouputil.js'
import lifecycle from '../../../util/lifecycle.js'
import solo from './solo.js'
import router from '../support/router.js'
import transport from '../support/transport.js'
import channels from '../support/channels.js'
import EventEmitter from 'events'

interface GroupState {
    email: string
    name: string
    group: string
}

type ADBKey = string
type Joined = boolean

interface GroupEvents {
    join: [GroupState, ADBKey[]]
    leave: [GroupState | null]
    autojoin: [ADBKey, Joined]
}

export default syrup.serial()
    .dependency(solo)
    .dependency(router)
    .dependency(transport)
    .dependency(channels)
    .define(async(options, solo, router, transport, channels) => {
        const log = logger.createLogger('base-device:plugins:group')

        const plugin = new class GroupManager extends EventEmitter<GroupEvents> {
            private currentGroup: GroupState | null = null

            keepalive = () => {
                if (this.currentGroup) {
                    channels.keepalive(this.currentGroup.group)
                }
            }

            get = async() => {
                if (!this.currentGroup) {
                    throw new grouputil.NoGroupError()
                    return
                }

                return this.currentGroup
            }

            join = (newGroup: GroupState, timeout: number, usage: string, keys: string[]) => {
                try {
                    if (!newGroup?.group) {
                        throw new Error(`New group is not valid: ${JSON.stringify(newGroup)}`)
                    }

                    if (!!this.currentGroup?.group) { // if device in group
                        if (this.currentGroup.group === newGroup.group) { // and is not same
                            this.keepalive()
                            return this.currentGroup
                        }

                        this.leave('takeover', false)
                    }

                    this.currentGroup = newGroup

                    log.important('Now owned by "%s"', this.currentGroup.email)
                    log.important('Device now in group "%s"', this.currentGroup.name)
                    log.info(`Rent time is ${timeout}`)
                    log.info('Subscribing to group channel "%s"', this.currentGroup.group)

                    channels.register(this.currentGroup.group, {
                        timeout: timeout || options.groupTimeout,
                        alias: solo.channel
                    })

                    plugin.emit('join', this.currentGroup, keys)

                    transport.send([
                        wireutil.global,
                        wireutil.pack(JoinGroupMessage, {
                            serial: options.serial,
                            owner: this.currentGroup,
                            usage,
                            timeout
                        })
                    ])

                    return this.currentGroup
                }
                catch (err: any) {
                    log.error(`Failed to join group ${JSON.stringify(newGroup)}, Error: %s`, err?.message)
                    return this.currentGroup
                }
            }

            leave = (reason: string, send = true) => {
                if (!this.currentGroup) {
                    return null
                }

                log.important('No longer owned by "%s"', this.currentGroup.email)

                channels.unregister(this.currentGroup.group)

                if (send) {
                    transport.send([
                        wireutil.global,
                        wireutil.pack(LeaveGroupMessage, {
                            serial: options.serial,
                            owner: this.currentGroup,
                            reason
                        })
                    ])
                }

                this.currentGroup = null
                plugin.emit('leave', null)

                return null
            }

            beforeActionCheck =
                async(message: any) => true

            // Set that for custom checks before GroupMessage/UngroupMessage processed (optional)
            setCheckBeforeAction =
                (cb: (message: any) => Promise<boolean>) => {
                    this.beforeActionCheck = cb
                }

            checkBeforeAction =
                (msgName: string, message: any, channel: string, reply: ReturnType<typeof wireutil.reply>) =>
                    this.beforeActionCheck(message)
                        .catch((err: any) => {
                            log.error('Error before processing %s: %s', msgName, err?.message)
                            transport.send([
                                channel,
                                reply.fail(err.message)
                            ])

                            return false
                        })
        }()

        router
            .on(GroupMessage, async(channel, message) => {
                const reply = wireutil.reply(options.serial)
                try {
                    if (!await plugin.checkBeforeAction('GroupMessage', message, channel, reply)) {
                        return
                    }

                    plugin.join(message.owner!, message.timeout!, message.usage!, message.keys)
                    transport.send([
                        channel,
                        reply.okay()
                    ])
                }
                catch (err: any) {
                    log.error('Failed processing GroupMessage: %s', err?.message)
                    if (err instanceof grouputil.AlreadyGroupedError) {
                        transport.send([
                            channel,
                            reply.fail(err.message)
                        ])
                    }
                }
            })
            .on(UngroupMessage, async(channel, message) => {
                const reply = wireutil.reply(options.serial)
                try {
                    if (!await plugin.checkBeforeAction('UngroupMessage', message, channel, reply)) {
                        return
                    }

                    plugin.leave('ungroup_request')
                    transport.send([
                        channel,
                        reply.okay()
                    ])
                }
                catch (err: any) {
                    log.error('Failed processing UngroupMessage: %s', err?.message)
                    if (err instanceof grouputil.NoGroupError) {
                        transport.send([
                            channel,
                            reply.fail(err.message)
                        ])
                    }
                }
            })

        // Any inbound device message counts as activity: refresh the current
        // group's lease so an actively-used device doesn't time out. Under
        // ROUTER/DEALER the router no longer sees a per-channel subscription, so
        // this activity-based keepalive lives here where the current group is
        // known (the router's emitted "channel" is a correlationId, not a group
        // channel). The lease is refreshed, not extended (see ChannelManager).
        router.on('message', () => {
            plugin.keepalive()
        })

        channels.on('timeout', async(channel) => {
            const currentGroup = await plugin.get()
            if (currentGroup && channel === currentGroup.group) {
                plugin.leave('automatic_timeout')
            }
        })

        lifecycle.observe(async() => {
            try {
                plugin.leave('device_absent')
            }
            catch (err: any) {
                log.error('Failed leave from group on process exit: %s', err?.message)
                if (err instanceof grouputil.NoGroupError) {
                    return true
                }
            }
        })

        return plugin
    })
