import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import {
    AutoGroupMessage,
    DeviceStatusChange,
    GroupMessage,
    JoinGroupMessage,
    LeaveGroupMessage, UngroupMessage
} from '../../../wire/wire.js'
import wireutil from '../../../wire/util.js'
import * as grouputil from '../../../util/grouputil.js'
import lifecycle from '../../../util/lifecycle.js'
import * as apiutil from '../../../util/apiutil.js'
import solo from './solo.js'
import router from '../support/router.js'
import push from '../support/push.js'
import sub from '../support/sub.js'
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
    .dependency(push)
    .dependency(sub)
    .dependency(channels)
    .define(async(options, solo, router, push, sub, channels) => {
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

            join = async(newGroup: GroupState, timeout: number, usage: string, keys: string[]) => {
                try {
                    if (!newGroup?.group) {
                        throw new Error(`New group is not valid: ${JSON.stringify(newGroup)}`)
                    }

                    if (!!this.currentGroup?.group) { // if device in group
                        if (this.currentGroup.group !== newGroup.group) { // and is not same
                            log.error(`Cannot join group ${JSON.stringify(newGroup)} since this device is in group ${JSON.stringify(this.currentGroup)}`)
                            throw new grouputil.AlreadyGroupedError()
                        }

                        log.info('Update timeout for %s', apiutil.QUARTER_MINUTES)
                        channels.updateTimeout(this.currentGroup.group, apiutil.QUARTER_MINUTES)

                        const newTimeout = channels.getTimeout(this.currentGroup.group)
                        push.send([
                            wireutil.global,
                            wireutil.pack(DeviceStatusChange, {
                                serial: options.serial,
                                timeout: newTimeout || undefined
                            })
                        ])

                        return this.currentGroup
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

                    sub.subscribe(this.currentGroup.group)
                    plugin.emit('join', this.currentGroup, keys)

                    push.send([
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

            leave = async(reason: string) => {
                if (!this.currentGroup) {
                    throw new grouputil.NoGroupError()
                }

                log.important('No longer owned by "%s"', this.currentGroup.email)
                log.info('Unsubscribing from group channel "%s"', this.currentGroup.group)

                push.send([
                    wireutil.global,
                    wireutil.pack(LeaveGroupMessage, {
                        serial: options.serial,
                        owner: this.currentGroup,
                        reason
                    })
                ])

                channels.unregister(this.currentGroup.group)
                sub.unsubscribe(this.currentGroup.group)

                this.currentGroup = null
                plugin.emit('leave', this.currentGroup)
                return this.currentGroup
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
                            push.send([
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

                    await plugin.join(message.owner!, message.timeout!, message.usage!, message.keys)
                    push.send([
                        channel,
                        reply.okay()
                    ])
                }
                catch (err: any) {
                    log.error('Failed processing GroupMessage: %s', err?.message)
                    if (err instanceof grouputil.AlreadyGroupedError) {
                        push.send([
                            channel,
                            reply.fail(err.message)
                        ])
                    }
                }
            })
            .on(AutoGroupMessage, async(channel, message) => {
                try {
                    await plugin.join(message.owner!, 0, message.identifier, [])
                    plugin.emit('autojoin', message.identifier, true)
                }
                catch (err: any) {
                    log.error('Failed processing AutoGroupMessage: %s', err?.message)
                    if (err instanceof grouputil.AlreadyGroupedError) {
                        plugin.emit('autojoin', message.identifier, false)
                    }
                }
            })
            .on(UngroupMessage, async(channel, message) => {
                const reply = wireutil.reply(options.serial)
                try {
                    if (!await plugin.checkBeforeAction('UngroupMessage', message, channel, reply)) {
                        return
                    }

                    await plugin.leave('ungroup_request')
                    push.send([
                        channel,
                        reply.okay()
                    ])
                }
                catch (err: any) {
                    log.error('Failed processing UngroupMessage: %s', err?.message)
                    if (err instanceof grouputil.NoGroupError) {
                        push.send([
                            channel,
                            reply.fail(err.message)
                        ])
                    }
                }
            })

        // @ts-ignore
        channels.on('timeout', async(channel) => {
            const currentGroup = await plugin.get()
            if (currentGroup && channel === currentGroup.group) {
                plugin.leave('automatic_timeout')
            }
        })

        lifecycle.observe(async() => {
            try {
                await plugin.leave('device_absent')
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
