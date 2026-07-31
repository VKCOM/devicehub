import {describe, it, expect} from 'vitest'
import {ProcessorRouting} from '../../../../lib/units/processor/routing.ts'
import {KIND, deviceKey} from '../../../../lib/wire/frame.ts'

// Pure routing logic for the processor (no ZMQ I/O). The processor has two
// inputs with different framing:
//   proxy DEALER:   [kind, ...]           (identity already stripped)
//   device ROUTER:  [deviceKeyId, kind, ...] (identity prepended)
// Two entry points, each returning Send[] tagged with the target channel
// (via 'router' -> devices, via 'dealer' -> proxy, via 'consume' -> local).

const f = (...parts: string[]) => parts.map(p => Buffer.from(p))
const str = (frames: Buffer[]) => frames.map(b => b.toString())

describe('ProcessorRouting: device-directed down (from proxy DEALER)', () => {
    it('routes D to the device by deviceKey, forwarding the reply-path unchanged', () => {
        const routing = new ProcessorRouting()
        // from proxy DEALER (no identity frame): [D, providerName, serial, api-1, body]
        const inbound = f(KIND.DEVICE, 'provider-a', 'serial-1', 'api-1', 'body')

        const sends = routing.routeFromProxy(inbound)

        expect(sends).toHaveLength(1)
        expect(sends[0].via).toBe('router')
        expect(sends[0].target!.toString()).toBe(deviceKey('provider-a', 'serial-1'))
        // reply-path forwarded as-is (processor does not push its own identity)
        expect(str(sends[0].frames)).toEqual([KIND.DEVICE, 'provider-a', 'serial-1', 'api-1', 'body'])
    })

    it('surfaces the proxy INIT timestamp for the startup presence sweep', () => {
        const routing = new ProcessorRouting()

        const sends = routing.routeFromProxy(f(KIND.INIT, '1700000000123'))

        expect(sends).toHaveLength(1)
        expect(sends[0].via).toBe('init')
        expect(sends[0].target).toBeUndefined()
        expect(str(sends[0].frames)).toEqual(['1700000000123'])
    })

    it('never mistakes an INIT for a device command', () => {
        const routing = new ProcessorRouting()

        const sends = routing.routeFromProxy(f(KIND.INIT, '1700000000123'))

        // an 'init' must not be pushed at a device: frames[1]/[2] of an INIT are
        // not providerName/serial, so a mis-tag would address a bogus deviceKey.
        expect(sends.every(s => s.via !== 'router')).toBe(true)
    })

    it('does not forward an INIT back up to the proxy', () => {
        const routing = new ProcessorRouting()

        const sends = routing.routeFromProxy(f(KIND.INIT, '1'))

        expect(sends.every(s => s.via !== 'dealer')).toBe(true)
    })

    it('leaves the timestamp frame verbatim for the glue to parse', () => {
        const routing = new ProcessorRouting()

        // routing must not coerce, validate or reformat — that is the unit's job.
        expect(str(routing.routeFromProxy(f(KIND.INIT, 'not-a-number'))[0].frames))
            .toEqual(['not-a-number'])
        expect(str(routing.routeFromProxy(f(KIND.INIT, ''))[0].frames)).toEqual([''])
    })

    it('ignores an INIT arriving from a DEVICE (wrong direction)', () => {
        const routing = new ProcessorRouting()
        const devId = deviceKey('provider-a', 'serial-1')

        // Devices only ever speak R or E; an I from below is silently dropped.
        expect(routing.routeFromDevice(f(devId, KIND.INIT, '123'))).toEqual([])
    })

    it('ignores a HELLO arriving from the proxy (wrong direction)', () => {
        const routing = new ProcessorRouting()

        // HELLO is processor->proxy only; it must never be interpreted inbound.
        expect(routing.routeFromProxy(f(KIND.HELLO))).toEqual([])
    })

    it('does not learn a provider as a side effect of an INIT', () => {
        const routing = new ProcessorRouting()

        routing.routeFromProxy(f(KIND.INIT, '1700000000123'))

        expect(routing.announceFrames()).toEqual([])
    })

    it('still routes a normal device command after an INIT', () => {
        const routing = new ProcessorRouting()
        routing.routeFromProxy(f(KIND.INIT, '1700000000123'))

        const sends = routing.routeFromProxy(f(KIND.DEVICE, 'provider-a', 'serial-1', 'api-1', 'body'))

        expect(sends[0].via).toBe('router')
        expect(sends[0].target!.toString()).toBe(deviceKey('provider-a', 'serial-1'))
    })
})

describe('ProcessorRouting: learnProvider announces exactly once per provider', () => {
    it('reports true only on the first sighting, so heartbeats do not re-announce', () => {
        const routing = new ProcessorRouting()

        // Truthy repeat would spam the proxy with redundant ANNOUNCE frames.
        expect(routing.learnProvider('provider-a')).toBe(true)
        expect(routing.learnProvider('provider-a')).toBe(false)
        expect(routing.learnProvider('provider-a')).toBe(false)
    })

    it('tracks each provider independently', () => {
        const routing = new ProcessorRouting()

        expect(routing.learnProvider('provider-a')).toBe(true)
        expect(routing.learnProvider('provider-b')).toBe(true)
        expect(routing.learnProvider('provider-a')).toBe(false)
        expect(routing.learnProvider('provider-b')).toBe(false)
    })

    it('keeps every learned provider in the bulk re-announce (proxy restart path)', () => {
        // This bulk replay repairs a restarted proxy's empty routing table.
        const routing = new ProcessorRouting()
        routing.learnProvider('provider-a')
        routing.learnProvider('provider-b')
        routing.learnProvider('provider-a')

        expect(routing.announceFrames().map(s => str(s.frames)).sort())
            .toEqual([[KIND.ANNOUNCE, 'provider-a'], [KIND.ANNOUNCE, 'provider-b']])
    })

    it('re-announces idempotently: the bulk replay can be run repeatedly', () => {
        const routing = new ProcessorRouting()
        routing.learnProvider('provider-a')

        expect(routing.announceFrames()).toEqual(routing.announceFrames())
    })
})

describe('ProcessorRouting: reply up (from device ROUTER)', () => {
    it('forwards an R reply up to the proxy, stripping the ROUTER-added device identity', () => {
        const routing = new ProcessorRouting()
        // from a device over the ROUTER: [deviceKeyId, R, api-1, body]
        const devId = deviceKey('provider-a', 'serial-1')
        const inbound = f(devId, KIND.REPLY, 'api-1', 'reply-body')

        const sends = routing.routeFromDevice(inbound)

        expect(sends).toHaveLength(1)
        expect(sends[0].via).toBe('dealer')
        expect(sends[0].target).toBeUndefined()
        // identity stripped; reply-path forwarded up unchanged
        expect(str(sends[0].frames)).toEqual([KIND.REPLY, 'api-1', 'reply-body'])
    })
})

describe('ProcessorRouting: device event (from device ROUTER)', () => {
    it('surfaces an E event for local consumption, keeping the sender identity and body', () => {
        const routing = new ProcessorRouting()
        // from a device over the ROUTER: [deviceKeyId, E, body]
        const devId = deviceKey('provider-a', 'serial-1')
        const inbound = f(devId, KIND.EVENT, 'body')

        const sends = routing.routeFromDevice(inbound)

        expect(sends).toHaveLength(1)
        // 'consume': glue decodes + dispatches locally; message type determines
        // whether to call dbapi or forward to app.
        expect(sends[0].via).toBe('consume')
        // sender identity preserved so a reply can be addressed back
        expect(sends[0].sender!.toString()).toBe(devId)
        // raw Envelope body handed over untouched
        expect(sends[0].frames).toHaveLength(1)
        expect(sends[0].frames[0].toString()).toBe('body')
    })

    it('drops an unknown device kind', () => {
        const routing = new ProcessorRouting()
        const devId = deviceKey('provider-a', 'serial-1')
        const inbound = f(devId, 'Z', 'body')

        expect(routing.routeFromDevice(inbound)).toEqual([])
    })
})

describe('ProcessorRouting: announce providers up to the proxy', () => {
    it('emits one ANNOUNCE frame per learned provider (for (re)connect)', () => {
        const routing = new ProcessorRouting()
        routing.learnProvider('provider-a')
        routing.learnProvider('provider-b')
        // learning the same provider twice must not duplicate the announce
        routing.learnProvider('provider-a')

        const sends = routing.announceFrames()

        expect(sends.every(s => s.via === 'dealer')).toBe(true)
        expect(sends.every(s => s.target === undefined)).toBe(true)
        expect(sends.map(s => str(s.frames)).sort())
            .toEqual([[KIND.ANNOUNCE, 'provider-a'], [KIND.ANNOUNCE, 'provider-b']])
    })

    it('has nothing to announce before any provider is learned', () => {
        const routing = new ProcessorRouting()
        expect(routing.announceFrames()).toEqual([])
    })
})
