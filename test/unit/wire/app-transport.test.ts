import {describe, it, expect} from 'vitest'
import {AppWire} from '../../../lib/wire/app-transport.ts'
import {KIND, deviceKey, BROADCAST_ALL} from '../../../lib/wire/frame.ts'
import {Envelope} from '../../../lib/wire/wire.ts'
import {DeviceHeartbeatMessage} from '../../../lib/wire/wire.ts'
import wireutil from '../../../lib/wire/util.ts'

// Pure app-side wire logic (no ZMQ). AppWire turns an app unit's intent —
// "send this command to device (providerName, serial)" — into the ROUTER/DEALER
// device frame, and classifies inbound frames the proxy delivers to an app-side
// DEALER: replies (R) and broadcasts (B). The proxy strips the DEALER identity
// and, before delivering, has already popped this receiver off any reply-path,
// so an app-side DEALER sees replies as [R, envelope] and broadcasts as
// [B, selector, envelope].

const str = (frames: Buffer[]) => frames.map(b => b.toString())

const heartbeatEnvelope = (serial: string, channel?: string): Buffer =>
    Buffer.from(wireutil.pack(DeviceHeartbeatMessage, {serial}, channel))

describe('AppWire: outbound device command', () => {
    it('encodes a device command as [D, providerName, serial, envelope]', () => {
        const wire = new AppWire()
        const env = heartbeatEnvelope('serial-1')

        const out = wire.encodeCommand('provider-a', 'serial-1', env)

        expect(str(out).slice(0, 3)).toEqual([KIND.DEVICE, 'provider-a', 'serial-1'])
        expect(out[out.length - 1]).toEqual(env)
    })
})

describe('AppWire: broadcast registration', () => {
    it('encodes a single [S] frame to register as a broadcast receiver', () => {
        const wire = new AppWire()
        const out = wire.encodeSubscribe()
        expect(str(out)).toEqual([KIND.SUBSCRIBE_BROADCAST])
    })
})

describe('AppWire: outbound broadcast publish', () => {
    it('encodes a broadcast as [B, BROADCAST_ALL, envelope] by default', () => {
        const wire = new AppWire()
        const env = heartbeatEnvelope('serial-1')

        const out = wire.encodeBroadcast(env)

        expect(str(out).slice(0, 2)).toEqual([KIND.BROADCAST, BROADCAST_ALL])
        expect(out[out.length - 1]).toEqual(env)
    })

    it('carries an explicit selector when given', () => {
        const wire = new AppWire()
        const env = heartbeatEnvelope('serial-1')

        const out = wire.encodeBroadcast(env, 'group-42')

        expect(str(out)).toEqual([KIND.BROADCAST, 'group-42', env.toString()])
    })
})

describe('AppWire: inbound classification (DEALER, identity already stripped)', () => {
    it('classifies a reply [R, envelope] as a reply carrying the correlationId', () => {
        const wire = new AppWire()
        const correlationId = 'txn_abc'
        const env = heartbeatEnvelope('serial-1', correlationId)

        const result = wire.classifyInbound([Buffer.from(KIND.REPLY), env])

        expect(result).not.toBeNull()
        expect(result!.kind).toBe(KIND.REPLY)
        expect(result!.channel).toBe(correlationId)
        expect(result!.body).toEqual(env)
    })

    it('classifies a broadcast [B, selector, envelope] as a broadcast body', () => {
        const wire = new AppWire()
        const env = heartbeatEnvelope('serial-1')

        const result = wire.classifyInbound([Buffer.from(KIND.BROADCAST), Buffer.from(''), env])

        expect(result).not.toBeNull()
        expect(result!.kind).toBe(KIND.BROADCAST)
        expect(result!.body).toEqual(env)
    })

    it('drops an empty probe/keepalive frame (returns null)', () => {
        const wire = new AppWire()
        expect(wire.classifyInbound([])).toBeNull()
        expect(wire.classifyInbound([Buffer.from('')])).toBeNull()
    })

    it('drops an unexpected kind (returns null)', () => {
        const wire = new AppWire()
        expect(wire.classifyInbound([Buffer.from('Z'), Buffer.from('x')])).toBeNull()
    })
})
