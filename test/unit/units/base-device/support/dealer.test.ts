import {describe, it, expect} from 'vitest'
import {DeviceWire} from '../../../../../lib/wire/device-transport.ts'
import {KIND} from '../../../../../lib/wire/frame.ts'
import {Envelope} from '../../../../../lib/wire/wire.ts'
import {Any} from '../../../../../lib/wire/google/protobuf/any.ts'
import {DeviceHeartbeatMessage, TransactionDoneMessage} from '../../../../../lib/wire/wire.ts'
import wireutil from '../../../../../lib/wire/util.ts'

// Pure device-side wire logic (no ZMQ, no real timers). DeviceWire turns the
// legacy `send([channel, envelope])` call — which every device plugin still
// makes — into the correct ROUTER/DEALER frame, and remembers the reply-path of
// each inbound command so a reply can be routed back.
//
// channel semantics (a device only ever speaks to its processor):
//   known correlationId -> R reply with correlationId re-injected into Envelope.channel
//   anything else       -> E event; processor decides whether to consume or forward

const str = (frames: Buffer[]) => frames.map(b => b.toString())

// Decode the channel out of an Envelope frame.
const channelOf = (frame: Buffer): string | undefined =>
    Envelope.fromBinary(frame).channel

// A wire message an app-directed command would carry.
const heartbeatEnvelope = (serial: string, channel?: string): Buffer =>
    Buffer.from(wireutil.pack(DeviceHeartbeatMessage, {serial}, channel))

// A reply envelope as produced by wireutil.reply(...).okay() — note it carries
// NO channel of its own.
const replyEnvelope = (): Buffer =>
    Buffer.from(wireutil.reply('serial-1').okay('success'))

describe('DeviceWire: outbound send([channel, envelope])', () => {
    it('wraps a global-channel send as an event to the processor (E)', () => {
        const wire = new DeviceWire()
        const env = heartbeatEnvelope('serial-1')

        const out = wire.send(wireutil.global, env)!

        expect(out[0].toString()).toBe(KIND.EVENT)
        expect(out[1]).toEqual(env)
        expect(out).toHaveLength(2)
    })

    it('wraps an unknown non-global channel (e.g. a group id) as an event too', () => {
        const wire = new DeviceWire()
        const env = heartbeatEnvelope('serial-1')

        const out = wire.send('group-42', env)!

        expect(out[0].toString()).toBe(KIND.EVENT)
        expect(out[1]).toEqual(env)
        expect(out).toHaveLength(2)
    })
})

describe('DeviceWire: reply round-trip (the tracer bullet)', () => {
    it('replies to an inbound command with R + the same reply-path, re-injecting the correlationId', () => {
        const wire = new DeviceWire()

        // Inbound command: [D, providerName, serial, ...replyPath, envelope]
        // Envelope.channel carries the correlationId.
        const correlationId = 'txn_abc'
        const command = [
            Buffer.from(KIND.DEVICE),
            Buffer.from('provider-a'),
            Buffer.from('serial-1'),
            Buffer.from('api-1'), // reply-path (api identity pushed by proxy)
            heartbeatEnvelope('serial-1', correlationId),
        ]

        // Support layer records the reply-path keyed by correlationId and
        // hands the plugin (channel, envelope) as before.
        const inbound = wire.receiveCommand(command)
        expect(inbound.channel).toBe(correlationId)

        // Plugin replies: push.send([correlationId, reply.okay()]).
        const out = wire.send(correlationId, replyEnvelope())!

        // -> [R, ...replyPath, envelope]
        expect(out[0].toString()).toBe(KIND.REPLY)
        expect(out[1].toString()).toBe('api-1')
        // Reply envelope carries correlationId so the api can match the transaction.
        expect(channelOf(out[2])).toBe(correlationId)
    })

    it('allows multiple replies on the same correlationId (progress... then okay)', () => {
        // A streaming command sends several progress replies before the final okay,
        // all on the same correlationId. The reply-path must survive until TTL sweep.
        const wire = new DeviceWire()
        const correlationId = 'txn_stream'
        wire.receiveCommand([
            Buffer.from(KIND.DEVICE),
            Buffer.from('provider-a'),
            Buffer.from('serial-1'),
            Buffer.from('api-1'),
            heartbeatEnvelope('serial-1', correlationId),
        ])

        const first = wire.send(correlationId, replyEnvelope())
        const second = wire.send(correlationId, replyEnvelope())
        const third = wire.send(correlationId, replyEnvelope())

        for (const out of [first, second, third]) {
            expect(out).not.toBeNull()
            expect(out![0].toString()).toBe(KIND.REPLY)
            expect(out![1].toString()).toBe('api-1')
        }
    })

    it('drops (returns null) a reply for an unknown correlationId', () => {
        const wire = new DeviceWire()
        const out = wire.send('txn_never_seen', replyEnvelope())
        expect(out).toBeNull()
    })
})

describe('DeviceWire: reply-path expiry', () => {
    it('forgets a reply-path after its TTL so the map does not grow forever', () => {
        let now = 1000
        const wire = new DeviceWire({ttl: 100, clock: () => now})

        const correlationId = 'txn_expire'
        wire.receiveCommand([
            Buffer.from(KIND.DEVICE),
            Buffer.from('provider-a'),
            Buffer.from('serial-1'),
            Buffer.from('api-1'),
            heartbeatEnvelope('serial-1', correlationId),
        ])

        now = 1201 // past ttl
        wire.sweep()

        expect(wire.send(correlationId, replyEnvelope())).toBeNull()
    })
})
