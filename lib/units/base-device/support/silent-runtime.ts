import {randomUUID} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import type {InactivityMonitor} from '../../../util/inactivity-monitor.js'
import {reduceSilentSnapshot} from './silent-snapshot.js'
import type {Any as WireAny} from '../../../wire/google/protobuf/any.js'
import type {SilentDeviceState} from '../../../wire/silent-device-state.js'
import * as wire from '../../../wire/wire.js'

export interface SilentGroup {
    joinExclusive(owner: {email: string; name: string; group: string}, keys: string[], timeout: number): Promise<unknown>
    leaveExclusive(reason: string): Promise<unknown>
    updateKeys?(keys: string[]): void
}

export class SilentError extends Error {
    constructor(public code: string) { super(code) }
}

/** Authoritative, ephemeral device state. Neither worker nor its callers need a device DB record. */
export class SilentDeviceRuntime {
    readonly instanceId = randomUUID()
    private sequence = 0
    private group?: SilentGroup
    private leaseId = ''
    private owner?: wire.SilentActor
    private phase: 'free' | 'acquiring' | 'owned' | 'releasing' = 'free'
    private acquireTask: Promise<void> = Promise.resolve()
    private releaseTask?: Promise<void>
    private reportedReady = false
    private failed = false
    private closed = false
    private state: SilentDeviceState

    constructor(
        readonly providerName: string,
        readonly serial: string,
        private allowedEmails: string[],
        private publish: (snapshot: string) => void,
        private inactivity: InactivityMonitor,
        private timeout: number,
        hideHeader = false,
    ) {
        this.state = {
            serial,
            provider: {name: providerName},
            silent: true,
            hideHeader,
            instanceId: this.instanceId,
            present: true,
            ready: false,
            status: wire.DeviceStatus.PREPARING,
            owner: null,
            using: false,
            usage: null,
            remoteConnect: false,
            remoteConnectUrl: null,
            reverseForwards: []
        }
    }

    bindGroup(group: SilentGroup) { this.group = group }

    context(): wire.SilentEventContext {
        return {
            instanceId: this.instanceId,
            sequence: ++this.sequence,
            leaseId: this.leaseId || undefined
        }
    }

    private checkActor(actor?: wire.SilentActor) {
        if (!actor?.email) throw new SilentError('unauthorized')
        if (this.allowedEmails.length && !this.allowedEmails.includes(actor.email)) throw new SilentError('forbidden')
    }

    describe(actor: wire.SilentActor) {
        this.checkActor(actor)
        const device = structuredClone(this.state)
        device.using = this.phase === 'owned' && this.owner?.email === actor.email
        if (!device.using) device.remoteConnectUrl = null
        return device
    }

    async acquire(actor: wire.SilentActor, instanceId: string) {
        this.checkActor(actor)
        if (this.closed) {
            throw new SilentError('device_absent')
        }

        if (instanceId !== this.instanceId) {
            throw new SilentError('stale_instance')
        }

        if (this.releaseTask || this.phase === 'releasing') {
            throw new SilentError('busy')
        }

        if (this.owner && this.owner.email !== actor.email) {
            throw new SilentError('busy')
        }

        if (this.phase === 'acquiring') {
            await this.acquireTask
        }

        // A waiting release or shutdown may have started while acquisition completed.
        if (this.closed) throw new SilentError('device_absent')

        if (this.releaseTask || (this.phase as string) === 'releasing') {
            throw new SilentError('busy')
        }

        if (this.phase === 'owned') {
            this.group?.updateKeys?.(actor.adbKeys)
            this.inactivity.keepalive()
            return this.acquired(actor)
        }

        if (!this.state.ready || !this.group) {
            throw new SilentError('not_ready')
        }

        this.phase = 'acquiring'
        this.owner = actor
        this.acquireTask = this.acquireLease(actor, this.group)
        await this.acquireTask

        if (this.closed || this.releaseTask || (this.phase as string) !== 'owned') {
            throw new SilentError('session_ended')
        }

        return this.acquired(actor)
    }

    private async acquireLease(actor: wire.SilentActor, group: SilentGroup): Promise<void> {
        try {
            await group.joinExclusive({email: actor.email, name: actor.name, group: actor.group}, actor.adbKeys, this.timeout)
            this.leaseId = randomUUID()
            this.phase = 'owned'
            this.state.owner = {email: actor.email, name: actor.name, group: actor.group}
            this.state.usage = 'debug'
            this.state.likelyLeaveReason = null
            this.changed()
            if (!this.closed && !this.releaseTask) {
                this.inactivity.start(this.timeout, () => { void this.release('timeout').catch(() => {}) })
            }
        }
        catch (err) {
            await group.leaveExclusive('acquire_failed').catch(() => { this.failed = true; this.state.ready = false })
            this.phase = 'free'
            this.owner = undefined
            throw err
        }
    }

    private acquired(actor: wire.SilentActor) {
        return {device: this.describe(actor), instanceId: this.instanceId, leaseId: this.leaseId, sequence: this.sequence}
    }

    authorize(context?: wire.SilentCommandContext) {
        if (this.phase !== 'owned' || context?.instanceId !== this.instanceId || context?.leaseId !== this.leaseId) {
            throw new SilentError('not_owner')
        }

        this.inactivity.keepalive()
    }

    release(reason = 'ungroup_request'): Promise<void> {
        if (this.releaseTask) {
            return this.releaseTask
        }

        this.releaseTask = this.releaseLease(reason).finally(() => { this.releaseTask = undefined })
        return this.releaseTask
    }

    private async releaseLease(reason: string): Promise<void> {
        this.inactivity.stop()
        if (this.phase === 'acquiring') {
            await this.acquireTask.catch(() => {
            })
        }

        if (this.phase === 'free') {
            return
        }

        this.phase = 'releasing'
        this.leaseId = ''
        this.state.owner = null
        this.state.usage = null
        this.state.remoteConnect = false
        this.state.remoteConnectUrl = null
        this.state.likelyLeaveReason = reason
        this.changed()

        try {
            await this.group?.leaveExclusive(reason)
        }
        catch (err) {
            this.failed = true
            this.state.ready = false
            throw err
        }
        finally {
            this.owner = undefined
            this.phase = 'free'
            this.changed()
        }
    }

    private changed() {
        this.publish(JSON.stringify(this.state))
    }

    /** Returns whether the original event is still needed by the processor. */
    observe(event: WireAny): boolean {
        const update = reduceSilentSnapshot(event, this.state)
        if (!update) {
            return true
        }

        if (update.reportedReady !== undefined) {
            this.reportedReady = update.reportedReady
        }

        const display = update.patch.display ?? this.state.display
        update.patch.ready = !this.failed && !this.closed && this.reportedReady && !!display?.url

        // Repeated battery/status reports must not serialize and broadcast an unchanged snapshot.
        const changed = (Object.keys(update.patch) as Array<keyof SilentDeviceState>)
            .some(key => !isDeepStrictEqual(this.state[key], update.patch[key]))

        if (changed) {
            Object.assign(this.state, update.patch)
            this.changed()
        }

        return update.forward === true
    }

    async close() {
        this.closed = true
        this.state.ready = false
        this.inactivity.stop()
        await this.release('device_absent')
    }
}
