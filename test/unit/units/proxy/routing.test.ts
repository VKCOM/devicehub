import {describe, it, expect} from 'vitest'
import {ProxyRouting} from '../../../../lib/units/proxy/routing.ts'
import {KIND} from '../../../../lib/wire/frame.ts'

// Pure routing logic for the proxy: given an inbound multipart (sender identity
// at frame 0) and the proxy's routing state, decide the outbound sends. No ZMQ.

const f = (...parts: string[]) => parts.map(p => Buffer.from(p))
const str = (frames: Buffer[]) => frames.map(b => b.toString())

describe('ProxyRouting: device-directed (D)', () => {
    it('routes a D message to the processor owning the providerName, pushing the sender onto the reply-path', () => {
        const routing = new ProxyRouting()
        routing.announceProvider('provider-a', Buffer.from('processor-1'))

        // api (identity "api-1") sends: [api-1, D, provider-a, serial-1, body]
        const inbound = f('api-1', KIND.DEVICE, 'provider-a', 'serial-1', 'body')

        const sends = routing.route(inbound)

        expect(sends).toHaveLength(1)
        expect(sends[0].target.toString()).toBe('processor-1')
        // reply-path gains the sender (api-1) just before the body
        expect(str(sends[0].frames))
            .toEqual([KIND.DEVICE, 'provider-a', 'serial-1', 'api-1', 'body'])
    })

    it('drops a D message for an unknown provider (no processor yet)', () => {
        const routing = new ProxyRouting()
        const inbound = f('api-1', KIND.DEVICE, 'ghost-provider', 'serial-1', 'body')

        const sends = routing.route(inbound)

        expect(sends).toEqual([])
    })
})

describe('ProxyRouting: reply (R)', () => {
    it('pops the top reply-path id and sends the reply there', () => {
        const routing = new ProxyRouting()
        // A processor sends back a reply. Its ROUTER-view inbound is:
        // [processorId, R, api-1, body]  (api-1 is the remaining reply-path)
        const inbound = f('processor-1', KIND.REPLY, 'api-1', 'reply-body')

        const sends = routing.route(inbound)

        expect(sends).toHaveLength(1)
        expect(sends[0].target.toString()).toBe('api-1')
        // reply-path now empty -> only [R, body] forwarded to the final recipient
        expect(str(sends[0].frames)).toEqual([KIND.REPLY, 'reply-body'])
    })
})

describe('ProxyRouting: broadcast (B)', () => {
    it('fans out only to registered broadcast receivers', () => {
        const routing = new ProxyRouting()
        routing.registerBroadcastReceiver(Buffer.from('websocket-1'))
        routing.registerBroadcastReceiver(Buffer.from('log-1'))

        // A processor emits an event: [processorId, B, selector, body]
        const inbound = f('processor-1', KIND.BROADCAST, '', 'event-body')
        const sends = routing.route(inbound)

        expect(sends.map(s => s.target.toString()).sort())
            .toEqual(['log-1', 'websocket-1'])
        // Each receiver gets the message minus the sender identity.
        for (const s of sends) {
            expect(str(s.frames)).toEqual([KIND.BROADCAST, '', 'event-body'])
        }
    })

    it('does not fan out to a unit that never registered (e.g. api)', () => {
        const routing = new ProxyRouting()
        routing.registerBroadcastReceiver(Buffer.from('websocket-1'))

        const inbound = f('processor-1', KIND.BROADCAST, '', 'event-body')
        const sends = routing.route(inbound)

        expect(sends.map(s => s.target.toString())).toEqual(['websocket-1'])
    })

    it('stops sending to a receiver after it is unregistered', () => {
        const routing = new ProxyRouting()
        const ws = Buffer.from('websocket-1')
        routing.registerBroadcastReceiver(ws)
        routing.unregisterBroadcastReceiver(ws)

        const inbound = f('processor-1', KIND.BROADCAST, '', 'event-body')
        expect(routing.route(inbound)).toEqual([])
    })
})

describe('ProxyRouting: control plane over the wire', () => {
    it('learns providerName->processor from an ANNOUNCE control frame', () => {
        const routing = new ProxyRouting()

        // processor announces it owns provider-a: [processorId, A, provider-a]
        const announce = f('processor-1', KIND.ANNOUNCE, 'provider-a')
        expect(routing.route(announce)).toEqual([]) // control: no forward

        // now a D for provider-a routes to processor-1
        const d = f('api-1', KIND.DEVICE, 'provider-a', 'serial-1', 'body')
        const sends = routing.route(d)
        expect(sends[0].target.toString()).toBe('processor-1')
    })

    it('registers a broadcast receiver from a SUBSCRIBE control frame', () => {
        const routing = new ProxyRouting()

        const sub = f('websocket-1', KIND.SUBSCRIBE_BROADCAST)
        expect(routing.route(sub)).toEqual([])

        const b = f('processor-1', KIND.BROADCAST, '', 'event-body')
        const sends = routing.route(b)
        expect(sends.map(s => s.target.toString())).toEqual(['websocket-1'])
    })
})

describe('ProxyRouting: one-shot startup INIT', () => {
    it('answers the FIRST HELLO with [I, startedAt] addressed to that processor', () => {
        const routing = new ProxyRouting(1700000000123)

        const sends = routing.route(f('processor-1', KIND.HELLO))

        expect(sends).toHaveLength(1)
        expect(sends[0].target.toString()).toBe('processor-1')
        expect(str(sends[0].frames)).toEqual([KIND.INIT, '1700000000123'])
    })

    it('sends INIT to exactly one processor, ignoring every later HELLO', () => {
        const routing = new ProxyRouting(1700000000123)

        expect(routing.route(f('processor-1', KIND.HELLO))).toHaveLength(1)
        // a second, later-replicated processor gets nothing
        expect(routing.route(f('processor-2', KIND.HELLO))).toEqual([])
        // and neither does the first one if it says hello again
        expect(routing.route(f('processor-1', KIND.HELLO))).toEqual([])
    })

    it('elects the FIRST processor even when many replicas hello in a burst', () => {
        const routing = new ProxyRouting(1700000000123)
        const replicas = ['processor-1', 'processor-2', 'processor-3', 'processor-4', 'processor-5']

        const elected = replicas.flatMap(id => routing.route(f(id, KIND.HELLO)))

        expect(elected).toHaveLength(1)
        expect(elected[0].target.toString()).toBe('processor-1')
    })

    it('stays latched across an arbitrary number of later hellos', () => {
        const routing = new ProxyRouting(1700000000123)
        routing.route(f('processor-1', KIND.HELLO))

        for (let i = 0; i < 100; i++) {
            expect(routing.route(f(`processor-${i}`, KIND.HELLO))).toEqual([])
        }
    })

    it('does not disturb normal routing: HELLO is not a provider announcement', () => {
        const routing = new ProxyRouting(1700000000123)
        routing.route(f('processor-1', KIND.HELLO))

        // HELLO carries no providerName, so nothing is routable yet
        expect(routing.route(f('api-1', KIND.DEVICE, 'provider-a', 'serial-1', 'body'))).toEqual([])

        // the separate ANNOUNCE is still what builds the provider table
        routing.route(f('processor-1', KIND.ANNOUNCE, 'provider-a'))
        const sends = routing.route(f('api-1', KIND.DEVICE, 'provider-a', 'serial-1', 'body'))
        expect(sends[0].target.toString()).toBe('processor-1')
    })

    it('elects on HELLO only — an ANNOUNCE must never trigger the INIT', () => {
        // This is the whole point of a separate HELLO: ANNOUNCE arrives on every
        // newly learned provider, so electing on it would be ambiguous.
        const routing = new ProxyRouting(1700000000123)

        expect(routing.route(f('processor-1', KIND.ANNOUNCE, 'provider-a'))).toEqual([])
        expect(routing.route(f('processor-1', KIND.ANNOUNCE, 'provider-b'))).toEqual([])

        // the election is still available for the real HELLO
        expect(routing.route(f('processor-1', KIND.HELLO))).toHaveLength(1)
    })

    it('does not let an app-side SUBSCRIBE consume the election', () => {
        const routing = new ProxyRouting(1700000000123)

        expect(routing.route(f('websocket-1', KIND.SUBSCRIBE_BROADCAST))).toEqual([])

        const sends = routing.route(f('processor-1', KIND.HELLO))
        expect(sends[0].target.toString()).toBe('processor-1')
    })

    it('reports the timestamp it was constructed with, not the time of the hello', () => {
        // The INIT must carry the PROXY START time. If it carried "now", a
        // long-running proxy would look younger than a freshly booted processor
        // and the reconciliation sweep would never run.
        const startedAt = 1600000000000
        const routing = new ProxyRouting(startedAt)

        const sends = routing.route(f('processor-1', KIND.HELLO))

        expect(sends[0].frames[1].toString()).toBe(String(startedAt))
    })

    it('defaults startedAt to construction time when not supplied', () => {
        const before = Date.now()
        const routing = new ProxyRouting()
        const after = Date.now()

        const sends = routing.route(f('processor-1', KIND.HELLO))
        const startedAt = Number(sends[0].frames[1].toString())

        expect(startedAt).toBeGreaterThanOrEqual(before)
        expect(startedAt).toBeLessThanOrEqual(after)
    })

    it('gives a fresh proxy instance its own election (per-proxy-lifetime, not global)', () => {
        // Modelling a proxy restart: a new ProxyRouting is a new lifetime, so the
        // one-shot budget resets and the processor that reconnects gets an INIT.
        const first = new ProxyRouting(1000)
        first.route(f('processor-1', KIND.HELLO))
        expect(first.route(f('processor-1', KIND.HELLO))).toEqual([])

        const restarted = new ProxyRouting(2000)
        const sends = restarted.route(f('processor-1', KIND.HELLO))

        expect(sends).toHaveLength(1)
        expect(str(sends[0].frames)).toEqual([KIND.INIT, '2000'])
    })

    it('keeps HELLO out of the broadcast fan-out', () => {
        const routing = new ProxyRouting(1700000000123)
        routing.route(f('websocket-1', KIND.SUBSCRIBE_BROADCAST))

        const sends = routing.route(f('processor-1', KIND.HELLO))

        // addressed to the processor that said hello, NOT to the subscribers
        expect(sends.map(s => s.target.toString())).toEqual(['processor-1'])
    })
})
