import {describe, it, expect} from 'vitest'
import {
    deviceKey,
    KIND,
    CORRELATION_PREFIX,
    BROADCAST_ALL,
    encodeDeviceFrame,
    encodeEvent,
    encodeReply,
    encodeAnnounce,
    encodeHello,
    encodeInit,
    encodeBroadcast,
    pushReplyPath,
    popReplyPath,
    classifyFrames,
} from '../../../lib/wire/frame.ts'

describe('deviceKey', () => {
    it('composes a cluster-unique key from providerName and serial', () => {
        // Two emulators with the same serial behind different providers must
        // produce distinct keys (the non-unique-serial problem).
        expect(deviceKey('provider-a', 'emulator-5554'))
            .not.toBe(deviceKey('provider-b', 'emulator-5554'))
    })
})

describe('encodeDeviceFrame', () => {
    it('produces [D, providerName, serial, envelope] with an empty reply-path', () => {
        const envelope = Buffer.from('body')
        const frames = encodeDeviceFrame('provider-a', 'emulator-5554', envelope)

        expect(frames).toHaveLength(4)
        expect(frames[0].toString()).toBe(KIND.DEVICE)
        expect(frames[1].toString()).toBe('provider-a')
        expect(frames[2].toString()).toBe('emulator-5554')
        expect(frames[3]).toBe(envelope)
    })
})

describe('encodeEvent', () => {
    it('produces [E, envelope] — a device-originated event for the processor', () => {
        const envelope = Buffer.from('body')
        const frames = encodeEvent(envelope)

        expect(frames).toHaveLength(2)
        expect(frames[0].toString()).toBe(KIND.EVENT)
        expect(frames[1]).toBe(envelope)
    })
})

describe('encodeReply', () => {
    it('produces [R, ...replyPath, envelope]', () => {
        const envelope = Buffer.from('body')
        const path = [Buffer.from('api'), Buffer.from('proxy')]
        const frames = encodeReply(path, envelope)

        expect(frames.map(f => f.toString()))
            .toEqual([KIND.REPLY, 'api', 'proxy', 'body'])
    })

    it('produces [R, envelope] for an empty reply-path', () => {
        const envelope = Buffer.from('body')
        const frames = encodeReply([], envelope)

        expect(frames.map(f => f.toString())).toEqual([KIND.REPLY, 'body'])
    })
})

describe('encodeAnnounce', () => {
    it('produces [A, providerName]', () => {
        const frames = encodeAnnounce('provider-a')

        expect(frames.map(f => f.toString())).toEqual([KIND.ANNOUNCE, 'provider-a'])
    })
})

describe('encodeHello', () => {
    it('produces a bodyless [H]', () => {
        expect(encodeHello().map(f => f.toString())).toEqual([KIND.HELLO])
    })

    it('carries no payload at all — it is pure identification', () => {
        expect(encodeHello()).toHaveLength(1)
    })

    it('is classified as HELLO once a ROUTER prepends the sender identity', () => {
        const inbound = [Buffer.from('processor-1'), ...encodeHello()]
        const {sender, kind, message} = classifyFrames(inbound, {routerPrepended: true})

        expect(sender!.toString()).toBe('processor-1')
        expect(kind).toBe(KIND.HELLO)
        expect(message.map(f => f.toString())).toEqual([KIND.HELLO])
    })
})

describe('encodeInit', () => {
    it('produces [I, startedAt] with the timestamp as a decimal string', () => {
        expect(encodeInit(1700000000123).map(f => f.toString()))
            .toEqual([KIND.INIT, '1700000000123'])
    })

    it('round-trips a Date.now()-shaped timestamp without precision loss', () => {
        // epoch millis exceed 2^32, so a naive 4-byte encoding would truncate.
        const now = 1764250000999
        const [, ts] = encodeInit(now)

        expect(Number(ts.toString())).toBe(now)
    })

    it('never emits exponential notation for realistic timestamps', () => {
        const [, ts] = encodeInit(Date.now())

        expect(ts.toString()).toMatch(/^\d+$/)
    })

    it('is classified as INIT off a DEALER, with the timestamp as the tail frame', () => {
        // The processor reads this off its DEALER, so no identity is prepended.
        const {sender, kind, message} = classifyFrames(encodeInit(42), {routerPrepended: false})

        expect(sender).toBeNull()
        expect(kind).toBe(KIND.INIT)
        expect(message.slice(1).map(f => f.toString())).toEqual(['42'])
    })
})

describe('control-plane kinds are mutually distinct', () => {
    it('gives every kind its own single-character tag', () => {
        const kinds = Object.values(KIND)

        expect(new Set(kinds).size).toBe(kinds.length)
        expect(kinds.every(k => k.length === 1)).toBe(true)
    })

    it('does not collide HELLO/INIT with the pre-existing kinds', () => {
        // A regression guard: reusing a letter would silently reroute traffic.
        expect(KIND.HELLO).not.toBe(KIND.ANNOUNCE)
        expect(KIND.HELLO).not.toBe(KIND.SUBSCRIBE_BROADCAST)
        expect(KIND.INIT).not.toBe(KIND.DEVICE)
        expect(KIND.INIT).not.toBe(KIND.REPLY)
        expect(KIND.INIT).not.toBe(KIND.EVENT)
        expect(KIND.INIT).not.toBe(KIND.BROADCAST)
    })
})

describe('encodeBroadcast', () => {
    it('produces [B, BROADCAST_ALL, envelope] by default', () => {
        const envelope = Buffer.from('body')
        const frames = encodeBroadcast(envelope)

        expect(frames[0].toString()).toBe(KIND.BROADCAST)
        expect(frames[1].toString()).toBe(BROADCAST_ALL)
        expect(frames[2]).toBe(envelope)
    })
})

describe('protocol constants', () => {
    it('CORRELATION_PREFIX is the txn_ marker shared with the transaction manager', () => {
        expect(CORRELATION_PREFIX).toBe('txn_')
    })

    it('BROADCAST_ALL is the empty selector', () => {
        expect(BROADCAST_ALL).toBe('')
    })
})

describe('classifyFrames', () => {
    it('reads kind and message from a DEALER frame (no prepended identity)', () => {
        // From a DEALER the identity is already stripped: [kind, ...message].
        const frames = [Buffer.from(KIND.EVENT), Buffer.from('body')]

        const {sender, kind, message} = classifyFrames(frames, {routerPrepended: false})

        expect(sender).toBeNull()
        expect(kind).toBe(KIND.EVENT)
        expect(message.map(f => f.toString())).toEqual([KIND.EVENT, 'body'])
    })

    it('reads sender, kind and message from a ROUTER frame (prepended identity)', () => {
        // A ROUTER prepends the sender identity: [senderId, kind, ...message].
        const frames = [Buffer.from('device-1'), Buffer.from(KIND.REPLY), Buffer.from('body')]

        const {sender, kind, message} = classifyFrames(frames, {routerPrepended: true})

        expect(sender!.toString()).toBe('device-1')
        expect(kind).toBe(KIND.REPLY)
        // message excludes the identity but keeps the kind + rest
        expect(message.map(f => f.toString())).toEqual([KIND.REPLY, 'body'])
    })
})

describe('pushReplyPath', () => {
    it('inserts the routingId onto the tail of the path, just before the body', () => {
        const envelope = Buffer.from('body')
        const frames = encodeDeviceFrame('provider-a', 'serial-1', envelope)

        const forwarded = pushReplyPath(frames, Buffer.from('api-id'))

        // header (D, provider, serial) + one path id + body
        expect(forwarded.map(f => f.toString()))
            .toEqual([KIND.DEVICE, 'provider-a', 'serial-1', 'api-id', 'body'])
    })

    it('stacks multiple ids in push order (LIFO stack, newest last)', () => {
        const envelope = Buffer.from('body')
        let frames = encodeDeviceFrame('provider-a', 'serial-1', envelope)

        frames = pushReplyPath(frames, Buffer.from('api-id'))
        frames = pushReplyPath(frames, Buffer.from('proxy-id'))

        expect(frames.map(f => f.toString()))
            .toEqual([KIND.DEVICE, 'provider-a', 'serial-1', 'api-id', 'proxy-id', 'body'])
    })
})

describe('popReplyPath', () => {
    it('pops the tail routingId (LIFO) and returns the remaining reply frames', () => {
        // Reply travelling down: ["R", api-id, proxy-id, body]
        // newest pushed id (proxy-id) comes off first.
        const reply: Buffer[] = [
            Buffer.from(KIND.REPLY),
            Buffer.from('api-id'),
            Buffer.from('proxy-id'),
            Buffer.from('body'),
        ]

        const popped = popReplyPath(reply)

        expect(popped.routingId!.toString()).toBe('proxy-id')
        expect(popped.frames.map(f => f.toString()))
            .toEqual([KIND.REPLY, 'api-id', 'body'])
        expect(popped.final).toBe(false)
    })

    it('signals the final recipient when the reply-path is empty', () => {
        const reply: Buffer[] = [
            Buffer.from(KIND.REPLY),
            Buffer.from('body'),
        ]

        const popped = popReplyPath(reply)

        expect(popped.routingId).toBeNull()
        expect(popped.final).toBe(true)
        expect(popped.body.toString()).toBe('body')
    })
})

describe('reply-path round trip (tracer bullet)', () => {
    it('routes a reply back through the exact chain it came from', () => {
        // Down: api -> proxy -> processor -> device.
        // Each hop pushes the routingId of the peer it received from.
        const body = Buffer.from('command')
        let down = encodeDeviceFrame('provider-a', 'serial-1', body)
        down = pushReplyPath(down, Buffer.from('api'))
        down = pushReplyPath(down, Buffer.from('proxy'))

        expect(down.map(f => f.toString()))
            .toEqual([KIND.DEVICE, 'provider-a', 'serial-1', 'api', 'proxy', 'command'])

        // Device replies. Up-to-down: processor pops "proxy" (send to proxy),
        // proxy pops "api" (send to api), api sees empty path -> final recipient.
        let reply: Buffer[] = [
            Buffer.from(KIND.REPLY),
            Buffer.from('api'),
            Buffer.from('proxy'),
            Buffer.from('reply-body'),
        ]

        const atProcessor = popReplyPath(reply)
        expect(atProcessor.routingId!.toString()).toBe('proxy')
        expect(atProcessor.final).toBe(false)

        const atProxy = popReplyPath(atProcessor.frames)
        expect(atProxy.routingId!.toString()).toBe('api')
        expect(atProxy.final).toBe(false)

        const atApi = popReplyPath(atProxy.frames)
        expect(atApi.final).toBe(true)
        expect(atApi.body.toString()).toBe('reply-body')
    })
})
