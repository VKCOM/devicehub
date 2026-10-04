import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wireutil from '../../../wire/util.js'
import * as grouputil from '../../../util/grouputil.js'
import lifecycle from '../../../util/lifecycle.js'
import router from '../support/router.js'
import transport from '../support/transport.js'
import EventEmitter from 'events'
import type {InactivityMonitor} from '../../../util/inactivity-monitor.js'
import {
    GroupMessage,
    JoinGroupMessage,
    LeaveGroupMessage,
    UngroupMessage
} from '../../../wire/wire.js'

interface OwnerState {
    email: string
    name: string
    group: string
}

interface JoinEvent {
    owner: OwnerState
    adbKeys: ADBKey[]
    timeout: number
    usage: string
}

type ADBKey = string
type Joined = boolean

interface GroupEvents {
    join: [JoinEvent]
    leave: [OwnerState, string]
    autojoin: [ADBKey, Joined]
    error: [string]
    timeout: []
    keys: [ADBKey[]]
}

export class GroupManager extends EventEmitter<GroupEvents> {
    updateKeys(keys: ADBKey[]) { this.emit('keys', keys) }
    private currentOwner: OwnerState | null = null

    constructor(private inactivity: InactivityMonitor) { super() }

    keepalive() { // WARN: high-frequency call
        this.inactivity.keepalive()
    }

    async joinExclusive(owner: OwnerState, adbKeys: ADBKey[], timeout: number) {
        if (this.currentOwner) throw new Error('busy')
        this.currentOwner = owner
        const event = {owner, adbKeys, timeout, usage: 'debug'}
        const results = await Promise.allSettled(this.rawListeners('join').map(listener => Promise.resolve().then(() => listener.call(this, event))))
        const failed = results.find(result => result.status === 'rejected')
        if (failed?.status === 'rejected') throw failed.reason
        return owner
    }

    async leaveExclusive(reason: string) {
        const owner = this.currentOwner
        this.currentOwner = null
        this.inactivity.stop()

        if (!owner) {
            return
        }

        const results = await Promise.allSettled(
            this.rawListeners('leave')
                .map(listener =>
                    Promise.resolve().then(() => listener.call(this, owner, reason))
                )
        )

        const failed = results.find(result => result.status === 'rejected')
        if (failed?.status === 'rejected') {
            throw failed.reason
        }
    }

    async get() {
        if (!this.currentOwner) {
            throw new grouputil.NoGroupError()
            return
        }

        return this.currentOwner
    }

    join(owner: OwnerState, timeout: number, usage: string, adbKeys: ADBKey[]) {
        try {
            if (!owner?.group) {
                throw new Error(`New group is not valid: ${JSON.stringify(owner)}`)
            }

            if (!!this.currentOwner?.group) {
                if (this.currentOwner.email === owner.email) {
                    this.keepalive()
                    return this.currentOwner
                }

                this.leave('takeover', false)
            }

            this.currentOwner = owner
            this.inactivity.start(timeout, () => {
                this.leave('automatic_timeout')
                this.emit('timeout')
            })

            super.emit('join', { owner, timeout, usage, adbKeys })

            return this.currentOwner
        }
        catch (err: any) {
            super.emit('error', `Failed to join group ${JSON.stringify(owner)}, Error: ${err?.message}`)
            return this.currentOwner
        }
    }

    leave(reason: string, send = true) {
        if (!this.currentOwner) {
            return null
        }

        this.inactivity.stop()

        if (send) {
            super.emit('leave', this.currentOwner, reason)
        }

        this.currentOwner = null
        return null
    }

    beforeActionCheck =
        async(message: any) => true

    // Set that for custom checks before GroupMessage/UngroupMessage processed (optional)
    setCheckBeforeAction =
        (cb: (message: any) => Promise<boolean>) => {
            this.beforeActionCheck = cb
        }
}

export default syrup.serial()
    .dependency(router)
    .dependency(transport)
    .define(async(options, router, transport) => {
        const log = logger.createLogger('base-device:plugins:group')

        const plugin = new GroupManager(transport.inactivity)
        transport.silent?.bindGroup(plugin)

        plugin.on('join', e => {
            log.important('Now owned by "%s"', e.owner.email)
            log.important('Device now in group "%s"', e.owner.name)
            log.info(`Rent time is ${e.timeout}`)
            log.info('Subscribing to group channel "%s"', e.owner.group)

            transport.send([
                wireutil.global,
                wireutil.pack(JoinGroupMessage, {
                    serial: options.serial,
                    owner: e.owner,
                    usage: e.usage,
                    timeout: e.timeout
                })
            ])
        })

        plugin.on('leave', (owner, reason) => {
            log.important('No longer owned by "%s"', owner.email)

            transport.send([
                wireutil.global,
                wireutil.pack(LeaveGroupMessage, {
                    serial: options.serial,
                    owner,
                    reason
                })
            ])
        })

        plugin.on('error', error => log.error(error))

        router
            .on(GroupMessage, async(channel, message) => {
                const reply = wireutil.reply(options.serial)
                try {
                    const check = await plugin.beforeActionCheck(message).catch(err => {
                        log.error('Error before processing GroupMessage: %s', err?.message)
                        transport.send([
                            channel,
                            reply.fail(err.message)
                        ])

                        return false
                    })

                    if (!check) {
                        return
                    }

                    plugin.join(message.owner!, message.timeout || options.groupTimeout, message.usage!, message.keys)
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
                    const check = await plugin.beforeActionCheck(message).catch(err => {
                        log.error('Error before processing UngroupMessage: %s', err?.message)
                        transport.send([
                            channel,
                            reply.fail(err.message)
                        ])

                        return false
                    })

                    if (!check) {
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
        // channel). Silent commands update the same monitor only after lease authorization.
        router.on('message', () => {
            if (!options.silent) plugin.keepalive()
        })

        lifecycle.observe(async() => {
            try {
                if (options.silent) {
                    await transport.silent?.close()
                }
                else {
                    plugin.leave('device_absent')
                }
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
