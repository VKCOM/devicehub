//
// The device-side transport for the ROUTER/DEALER protocol.
//
// Two layers:
//   - DeviceWire: pure framing logic (no ZMQ, no timers) — testable in
//     isolation. Turns a plugin's `send(channel, envelope)` into wire frames
//     and remembers each inbound command's reply-path.
//   - DeviceTransport: ZMQ glue over a DealerSocket, exposing the interface
//     device plugins use (`send([channel, envelope])`,
//     `on('message', (channel, envelope))`).
//
// A device only ever speaks to its processor. The outbound kind depends on
// the channel argument to send():
//
//   known correlationId (command's Envelope.channel) -> [R, ...replyPath, envelope]
//   stale/unknown correlationId (txn_ prefix)        -> dropped (command timed out)
//   any other channel (global, group id, status)     -> [E, envelope]  (device event)
//
// Kind E carries every device-originated message that is NOT a reply: intros,
// heartbeats, status updates and group broadcasts. The processor decides by
// message type whether to consume it (dbapi) or forward it to the app side.
//
// A device receives commands as [D, providerName, serial, ...replyPath,
// envelope]. DeviceWire records the reply-path keyed by the command's
// correlationId and uses it when the plugin replies. An unknown correlationId
// is dropped.
//
import {EventEmitter} from 'events'
import logger from '../util/logger.js'
import type {DealerSocket} from '../util/zmqsocket.js'
import {KIND, CORRELATION_PREFIX, encodeEvent, encodeReply, classifyFrames} from './frame.js'
import {Envelope} from './wire.js'

// Envelope.channel is proto field 3, wire type 2 (LEN): tag = (3 << 3) | 2 = 0x1a.
// Appending this field to an existing Envelope binary injects the channel without a
// full decode/encode round-trip. Proto optional-string last-occurrence-wins semantics
// make appending safe when a channel is already present.
// All correlationIds (txn_<uuid>) are well under 128 bytes — single-byte varint length.
const CHANNEL_TAG = 0x1a

function injectChannelField(envelope: Buffer, channel: string): Buffer {
    const bytes = Buffer.from(channel, 'utf8')
    const header = Buffer.allocUnsafe(2)
    header[0] = CHANNEL_TAG
    header[1] = bytes.length
    return Buffer.concat([envelope, header, bytes])
}

const log = logger.createLogger('wire:device-transport')

// How often to sweep expired reply-paths out of the DeviceWire map.
const SWEEP_INTERVAL = 60 * 1000

export interface DeviceWireOptions {
    // How long (ms) to remember a command's reply-path before sweeping it.
    ttl?: number
    // Injectable clock for testing.
    clock?: () => number
}

export interface InboundCommand {
    // The correlationId the command carried (Envelope.channel), handed to the
    // plugin as the "channel" it used to receive on.
    channel: string
    // The Envelope body frame, to be decoded by the WireRouter as before.
    envelope: Buffer
}

interface PendingReplyPath {
    // The reply-path frames (identities) to send the reply back along.
    replyPath: Buffer[]
    // The correlationId (Envelope.channel of the inbound command) — cached here
    // so reply() never needs to decode the reply envelope again.
    correlationId: string
    // When this entry was recorded (for TTL sweeping).
    at: number
}

const DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes: longer than any transaction.

export class DeviceWire {
    private ttl: number
    private clock: () => number
    // correlationId -> the reply-path of the command that carried it.
    private replyPaths = new Map<string, PendingReplyPath>()

    constructor(options: DeviceWireOptions = {}) {
        this.ttl = options.ttl ?? DEFAULT_TTL
        this.clock = options.clock ?? Date.now
    }

    // Record an inbound command's reply-path and return the (channel, envelope)
    // for the plugin layer. Framing: [D, providerName, serial, ...replyPath, envelope].
    // The reply-path is everything between the serial frame and the body.
    receiveCommand(frames: Buffer[]): InboundCommand {
        const envelope = frames[frames.length - 1]
        const replyPath = frames.slice(3, frames.length - 1)
        const channel = Envelope.fromBinary(envelope).channel ?? ''
        if (channel) {
            this.replyPaths.set(channel, {replyPath, correlationId: channel, at: this.clock()})
        }
        return {channel, envelope}
    }

    // Translate a plugin's send([channel, envelope]) into outbound frames.
    // Returns null when the send should be dropped (unknown correlationId).
    send(channel: string, envelope: Buffer): Buffer[] | null {
        const pending = this.replyPaths.get(channel)
        if (pending) {
            // Do NOT delete the reply-path here: a single command may produce
            // several replies (streaming progress chunks then a final okay), all
            // on the same correlationId. The path is kept until the TTL sweep.
            return this.reply(pending, envelope)
        }

        // An unknown correlationId: the command timed out and its reply-path
        // was swept. Drop rather than mis-deliver as an event.
        if (channel.startsWith(CORRELATION_PREFIX)) {
            return null
        }

        // Anything else (global, group id, status update) is a device event.
        return encodeEvent(envelope)
    }

    // Drop reply-paths older than the TTL so the map cannot grow without bound
    // (a command whose reply never came would otherwise leak).
    sweep() {
        const cutoff = this.clock() - this.ttl
        for (const [channel, pending] of this.replyPaths) {
            if (pending.at < cutoff) {
                this.replyPaths.delete(channel)
            }
        }
    }

    private reply(pending: PendingReplyPath, envelope: Buffer): Buffer[] {
        // The reply envelope (from wireutil.reply(...)) carries no channel; the
        // requester's TransactionManager matches replies by Envelope.channel, so we
        // inject the correlationId via binary field append (proto field 3) instead
        // of a full decode/encode round-trip.
        const withChannel = injectChannelField(envelope, pending.correlationId)
        return encodeReply(pending.replyPath, withChannel)
    }
}

// The plugin-facing device transport over a DEALER. Mirrors the shape plugins
// already use (`send`, `on('message')`) so no plugin needs to change.
export class DeviceTransport extends EventEmitter {
    private wire: DeviceWire
    private sweepTimer?: NodeJS.Timeout
    private closed = false

    constructor(private dealer: DealerSocket) {
        super()
        this.wire = new DeviceWire()

        this.dealer.on('frames', (frames: Buffer[]) => {
            try {
                this.onFrames(frames)
            }
            catch (err: any) {
                log.error('Inbound framing error: %s', err?.message || err)
            }
        })

        this.sweepTimer = setInterval(() => this.wire.sweep(), SWEEP_INTERVAL)
        this.sweepTimer.unref?.()
    }

    private onFrames(frames: Buffer[]) {
        // probeRouter/empty keepalive frames — ignore.
        if (!frames.length || (frames.length === 1 && frames[0].length === 0)) {
            return
        }
        // The device DEALER has already stripped any identity frame.
        const {kind} = classifyFrames(frames, {routerPrepended: false})
        if (kind === KIND.DEVICE) {
            const {channel, envelope} = this.wire.receiveCommand(frames)
            // Re-emit in the shape the WireRouter consumes.
            this.emit('message', channel, envelope)
        }
        // Any other kind targeted at a device is unexpected; drop silently.
    }

    // Plugins call send([channel, envelope]); accept that array shape loosely
    // (callsites are untyped legacy JS).
    send(args: [string, Uint8Array] | any[]) {
        if (this.closed) return
        const channel = String(args[0])
        const payload = args[1] as Uint8Array
        const envelope = Buffer.isBuffer(payload) ? payload : Buffer.from(payload)
        const out = this.wire.send(channel, envelope)
        if (!out) {
            return // dropped: unknown/stale correlationId
        }
        this.dealer.send(out).catch((err: any) =>
            log.warn('Undeliverable to processor: %s', err?.message))
    }

    async close() {
        if (this.closed) return
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer)
        }

        this.closed = true
        this.removeAllListeners()
        await this.dealer.flush()
        return this.dealer.close()
    }
}
