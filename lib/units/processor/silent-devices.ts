import {Any} from '../../wire/google/protobuf/any.js'
import {deviceKey} from '../../wire/frame.js'
import wireutil from '../../wire/util.js'
import {
    Envelope,
    DeviceRegisteredMessage,
    DeviceIntroductionMessage,
    DeviceIosIntroductionMessage,
    DeviceReadyMessage,
    DeviceAbsentMessage,
    ProbeMessage,
    SilentDeviceEvent,
    SilentDeviceSnapshot,
    DeviceLogcatEntryMessage,
    ResolveAdbPortRequest,
    ResolveAdbPortResponse,
    type SilentEventContext
} from '../../wire/wire.js'

interface SilentMetadata {
    providerName: string
    serial: string
    at: number
    context: SilentEventContext
}

/** Presence/routing metadata only. Silent events never enter the DB dispatcher. */
export class SilentDevices {
    private live = new Map<string, SilentMetadata>()
    private timer?: ReturnType<typeof setTimeout>
    private nextExpiry = Infinity

    constructor(
        private timeout: number,
        private broadcast: (envelope: Uint8Array) => void,
        private now = () => performance.now(),
        private onDiscover?: (provider: string, serial: string) => void
    ) {}

    has(providerName: string, serial: string): boolean {
        return this.live.has(deviceKey(providerName, serial))
    }

    consume(providerName: string, serial: string, envelope: Envelope, reply: (bytes: Uint8Array) => void) {
        if (!envelope.silentEvent) {
            return false
        }

        const context = envelope.silentEvent
        const event = envelope.message

        if (!event || !context.instanceId) {
            return true
        }

        const key = deviceKey(providerName, serial)
        const previous = this.live.get(key)

        if (previous?.context.instanceId === context.instanceId && previous.context.sequence >= context.sequence) {
            return true
        }

        if (!previous) {
            this.onDiscover?.(providerName, serial)
        }

        const entry = previous ?? {providerName, serial, context, at: 0}
        entry.context = context
        entry.at = this.now()

        // Map insertion order is also expiry order. Renew in O(1), reusing the entry.
        this.live.delete(key)
        this.live.set(key, entry)

        if (Any.contains(event, DeviceIntroductionMessage) || Any.contains(event, DeviceIosIntroductionMessage)) {
            reply(wireutil.pack(DeviceRegisteredMessage, {serial}))
        }
        else if (Any.contains(event, DeviceReadyMessage)) {
            reply(wireutil.pack(ProbeMessage, {}))
        }
        else if (Any.contains(event, ResolveAdbPortRequest)) {
            reply(wireutil.pack(ResolveAdbPortResponse, {
                requestId: Any.unpack(event, ResolveAdbPortRequest).requestId, error: 'Silent devices have no persisted ADB port'
            }))
        }
        else if (Any.contains(event, SilentDeviceSnapshot) || Any.contains(event, DeviceLogcatEntryMessage) || Any.contains(event, DeviceAbsentMessage)) {
            this.broadcast(wireutil.pack(SilentDeviceEvent, {providerName, serial, context, event}))
        }

        if (Any.contains(event, DeviceAbsentMessage)) {
            this.live.delete(key)
        }

        this.scheduleExpiry()
        return true
    }

    expire() {
        clearTimeout(this.timer)
        this.timer = undefined
        this.nextExpiry = Infinity
        const now = this.now()

        for (const [key, entry] of this.live) {
            if (now - entry.at < this.timeout) break
            this.live.delete(key)
            this.broadcast(wireutil.pack(SilentDeviceEvent, {
                providerName: entry.providerName, serial: entry.serial,
                context: {...entry.context, sequence: entry.context.sequence + 1},
                event: Any.pack({serial: entry.serial}, DeviceAbsentMessage)
            }))
        }

        this.scheduleExpiry()
    }

    private scheduleExpiry() {
        const first = this.live.values().next().value
        if (!first) {
            clearTimeout(this.timer)
            this.timer = undefined
            this.nextExpiry = Infinity
            return
        }

        const deadline = first.at + this.timeout

        // Keeping an earlier wakeup avoids replacing the timer on every heartbeat.
        if (deadline >= this.nextExpiry) {
            return
        }

        clearTimeout(this.timer)
        this.nextExpiry = deadline
        this.timer = setTimeout(() => this.expire(), Math.max(1, deadline - this.now()))
        this.timer.unref?.()
    }

    close() {
        clearTimeout(this.timer); this.timer = undefined; this.nextExpiry = Infinity; this.live.clear()
    }
}
