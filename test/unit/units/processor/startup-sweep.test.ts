import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'

// The startup presence reconciliation sweep, driven end-to-end over real ZMQ
// sockets with Mongo mocked out.
//
// The behaviour under test lives inside the processor unit's closure, so it is
// exercised the way production does: a stand-in proxy ROUTER waits for the
// processor's one-shot HELLO and answers with an INIT carrying a chosen
// timestamp. Everything else (the presence TTL, the re-check query, the absent
// broadcasts) is then observed through the mocked db calls and the frames that
// arrive back at the proxy.
//
// Real timers are used deliberately: ZMQ's receive loop needs them, so the
// heartbeat timeout is set to a few hundred ms instead of being faked.

const loadDevicesPresentBefore = vi.fn()
const setDeviceAbsent = vi.fn(async () => ({}))
const setDevicePresent = vi.fn(async () => ({}))

vi.mock('../../../../lib/db/index.js', () => ({
    default: {
        // Strip the connectivity wrapper: no Mongo in this test.
        ensureConnectivity: (fn: any) => fn,
        connect: async () => ({}),
    },
}))

vi.mock('../../../../lib/db/models/device/index.js', () => ({
    default: {
        loadDevicesPresentBefore,
        loadPresentDevices: vi.fn(async () => []),
        getDeadDevice: vi.fn(async () => []),
        loadDeviceBySerial: vi.fn(async () => null),
        deleteDevice: vi.fn(async () => ({})),
    },
}))

vi.mock('../../../../lib/db/models/all/index.js', () => ({
    default: {
        setDeviceAbsent,
        setDevicePresent,
        saveDeviceInitialState: vi.fn(async () => ({})),
        saveIosDeviceInitialState: vi.fn(async () => ({})),
        initializeIosDeviceState: vi.fn(async () => ({})),
        saveDeviceStatus: vi.fn(async () => ({})),
        setDeviceReady: vi.fn(async () => ({})),
        sendEvent: vi.fn(async () => ({})),
        setDeviceState: vi.fn(async () => ({})),
    },
}))

vi.mock('../../../../lib/db/models/user/index.js', () => ({
    default: {lookupUserByAdbFingerprint: vi.fn(async () => null)},
}))

const {RouterSocket, DealerSocket} = await import('../../../../lib/util/zmqsocket.ts')
const {KIND, encodeInit, encodeEvent, deviceKey} = await import('../../../../lib/wire/frame.ts')
const {Envelope, DeviceHeartbeatMessage, DeviceAbsentMessage, DevicePresentMessage} =
    await import('../../../../lib/wire/wire.ts')
const {Any} = await import('../../../../lib/wire/google/protobuf/any.ts')
const wireutil = (await import('../../../../lib/wire/util.js')).default
const processorUnit = (await import('../../../../lib/units/processor/index.ts')).default

const nextPort = (() => {
    let p = 16400
    return () => p++
})()

const HEARTBEAT_TIMEOUT = 250

const ABSENT_URL = Any.typeNameToUrl(DeviceAbsentMessage.typeName)
const PRESENT_URL = Any.typeNameToUrl(DevicePresentMessage.typeName)

// A device row as projected by loadDevicesPresentBefore.
const row = (providerName: string, serial: string) =>
    ({serial, provider: {name: providerName}})

interface Harness {
    proxy: InstanceType<typeof RouterSocket>
    processorId: Buffer
    // Broadcast envelopes ([B, selector, envelope]) decoded by type url.
    broadcastsOf: (typeUrl: string) => any[]
    sendInit: (startedAt: number) => Promise<void>
    heartbeat: (providerName: string, serial: string) => Promise<void>
    deviceRouterAddr: string
}

describe('processor: startup presence reconciliation sweep', () => {
    const closing: Array<{close: () => any}> = []

    beforeEach(() => {
        loadDevicesPresentBefore.mockReset()
        setDeviceAbsent.mockReset()
        setDevicePresent.mockReset()
        setDeviceAbsent.mockImplementation(async () => ({}))
        setDevicePresent.mockImplementation(async () => ({}))
    })

    afterEach(async () => {
        await Promise.all(closing.splice(0).map(s => Promise.resolve(s.close()).catch(() => {})))
        vi.clearAllMocks()
    })

    // Boot a stand-in proxy plus a real processor, and wait for the HELLO.
    const boot = async (name = 'processor-1'): Promise<Harness> => {
        const proxyAddr = `tcp://127.0.0.1:${nextPort()}`
        const deviceRouterAddr = `tcp://127.0.0.1:${nextPort()}`

        const proxy = new RouterSocket()
        await proxy.bind(proxyAddr)
        closing.push(proxy)

        const inbound: Buffer[][] = []
        let helloFrom: Buffer | null = null
        proxy.on('frames', (frames: Buffer[]) => {
            inbound.push(frames)
            if (frames[1]?.toString() === KIND.HELLO) {
                helloFrom ??= frames[0]
            }
        })

        const unit = await processorUnit({
            name,
            endpoints: {proxy: [proxyAddr], deviceRouter: deviceRouterAddr},
            heartbeatTimeout: HEARTBEAT_TIMEOUT,
            publicIp: '127.0.0.1',
        } as any)
        // Tear the processor down between tests: a leaked instance keeps its
        // presence TTL timers alive and would fire absent reaps into the next
        // test's mocks.
        closing.push({close: () => unit.shutdown()})

        // The HELLO is the handshake the whole mechanism hangs off.
        await vi.waitFor(() => expect(helloFrom).not.toBeNull(), {timeout: 2000, interval: 10})

        const devices: Array<InstanceType<typeof DealerSocket>> = []

        return {
            proxy,
            processorId: helloFrom!,
            deviceRouterAddr,
            broadcastsOf: (typeUrl) => inbound
                .filter(f => f[1]?.toString() === KIND.BROADCAST)
                .map(f => Envelope.fromBinary(f[f.length - 1]))
                .filter(e => e.message?.typeUrl === typeUrl),
            sendInit: async (startedAt) => {
                await proxy.send([helloFrom!, ...encodeInit(startedAt)])
            },
            heartbeat: async (providerName, serial) => {
                const dealer = new DealerSocket({
                    routingId: deviceKey(providerName, serial),
                    probeRouter: true,
                })
                dealer.connect(deviceRouterAddr)
                devices.push(dealer)
                closing.push(dealer)
                await dealer.send(encodeEvent(
                    Buffer.from(wireutil.pack(DeviceHeartbeatMessage, {serial}))))
            },
        }
    }

    it('sends exactly one HELLO on startup', async () => {
        const h = await boot()
        const hellos: Buffer[][] = []
        h.proxy.on('frames', (f: Buffer[]) => {
            if (f[1]?.toString() === KIND.HELLO) {
                hellos.push(f)
            }
        })

        await new Promise(r => setTimeout(r, 200))

        // The one HELLO was already consumed by boot(); no further ones follow.
        expect(hellos).toHaveLength(0)
    })

    it('queries devices present before its own boot when the proxy is OLDER', async () => {
        loadDevicesPresentBefore.mockResolvedValue([])
        const h = await boot()

        await h.sendInit(Date.now() - 60_000)

        await vi.waitFor(() => expect(loadDevicesPresentBefore).toHaveBeenCalledTimes(1),
            {timeout: 2000, interval: 10})

        // The cutoff must be the PROCESSOR's start time, as a Date for Mongo.
        const cutoff = loadDevicesPresentBefore.mock.calls[0][0]
        expect(cutoff).toBeInstanceOf(Date)
        expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now())
        expect(cutoff.getTime()).toBeGreaterThan(Date.now() - 30_000)
    })

    it('does NOTHING when the proxy is YOUNGER (the proxy, not us, restarted)', async () => {
        loadDevicesPresentBefore.mockResolvedValue([row('provider-a', 'serial-1')])
        const h = await boot()

        await h.sendInit(Date.now() + 60_000)
        await new Promise(r => setTimeout(r, HEARTBEAT_TIMEOUT * 2))

        expect(loadDevicesPresentBefore).not.toHaveBeenCalled()
        expect(setDeviceAbsent).not.toHaveBeenCalled()
    })

    it('treats an equal timestamp as not-older (no sweep)', async () => {
        loadDevicesPresentBefore.mockResolvedValue([row('provider-a', 'serial-1')])
        const h = await boot()

        // Same millisecond as our boot: we did not outlive the proxy.
        await h.sendInit(Date.now())
        await new Promise(r => setTimeout(r, HEARTBEAT_TIMEOUT * 2))

        expect(setDeviceAbsent).not.toHaveBeenCalled()
    })

    it('does not broadcast a bogus present for the devices it merely watches', async () => {
        loadDevicesPresentBefore.mockResolvedValue([
            row('provider-a', 'serial-1'),
            row('provider-a', 'serial-2'),
        ])
        const h = await boot()

        await h.sendInit(Date.now() - 60_000)
        await vi.waitFor(() => expect(loadDevicesPresentBefore).toHaveBeenCalled(),
            {timeout: 2000, interval: 10})
        await new Promise(r => setTimeout(r, 80))

        // Seeding is silent: we are not claiming these devices.
        expect(h.broadcastsOf(PRESENT_URL)).toEqual([])
    })

    it('marks a still-stale device absent once its TTL expires, and persists it', async () => {
        loadDevicesPresentBefore.mockResolvedValue([row('provider-a', 'serial-1')])
        const h = await boot()

        await h.sendInit(Date.now() - 60_000)

        await vi.waitFor(() => expect(setDeviceAbsent).toHaveBeenCalledTimes(1),
            {timeout: HEARTBEAT_TIMEOUT * 8, interval: 10})

        const [serial, presenceChangedAt] = setDeviceAbsent.mock.calls[0] as any[]
        expect(serial).toBe('serial-1')
        // The CAS guard in setDeviceAbsent needs a real epoch-millis timestamp.
        expect(typeof presenceChangedAt).toBe('number')
        expect(presenceChangedAt).toBeGreaterThan(0)

        // ...and the app side is told, so websocket clients drop the device.
        await vi.waitFor(() => expect(h.broadcastsOf(ABSENT_URL)).toHaveLength(1),
            {timeout: 2000, interval: 10})
        const absent = Any.unpack(h.broadcastsOf(ABSENT_URL)[0].message!, DeviceAbsentMessage)
        expect(absent.serial).toBe('serial-1')
        expect(absent.presenceChangedAt).toBe(presenceChangedAt)
    })

    it('RE-QUERIES Mongo on expiry and spares a device another processor adopted', async () => {
        // Seeded with two devices; by the time the TTL expires, serial-2 has been
        // adopted elsewhere (its introduction bumped presenceChangedAt past our
        // cutoff), so it is no longer returned by the re-check.
        loadDevicesPresentBefore
            .mockResolvedValueOnce([row('provider-a', 'serial-1'), row('provider-a', 'serial-2')])
            .mockResolvedValue([row('provider-a', 'serial-1')])
        const h = await boot()

        await h.sendInit(Date.now() - 60_000)

        await vi.waitFor(() => expect(setDeviceAbsent).toHaveBeenCalledTimes(1),
            {timeout: HEARTBEAT_TIMEOUT * 8, interval: 10})
        await new Promise(r => setTimeout(r, 120))

        // The re-check happened (seed + verify), and only the still-stale one died.
        expect(loadDevicesPresentBefore.mock.calls.length).toBeGreaterThanOrEqual(2)
        expect(setDeviceAbsent.mock.calls.map((c: any[]) => c[0])).toEqual(['serial-1'])
    })

    it('marks nothing absent when every seeded device was adopted meanwhile', async () => {
        loadDevicesPresentBefore
            .mockResolvedValueOnce([row('provider-a', 'serial-1'), row('provider-a', 'serial-2')])
            .mockResolvedValue([])
        const h = await boot()

        await h.sendInit(Date.now() - 60_000)
        await new Promise(r => setTimeout(r, HEARTBEAT_TIMEOUT * 4))

        expect(loadDevicesPresentBefore.mock.calls.length).toBeGreaterThanOrEqual(2)
        expect(setDeviceAbsent).not.toHaveBeenCalled()
    })

    it('batches N expiries into a SINGLE re-check query', async () => {
        const many = Array.from({length: 25}, (_, i) => row('provider-a', `serial-${i}`))
        loadDevicesPresentBefore.mockResolvedValue(many)
        const h = await boot()

        await h.sendInit(Date.now() - 60_000)

        await vi.waitFor(() => expect(setDeviceAbsent).toHaveBeenCalledTimes(25),
            {timeout: HEARTBEAT_TIMEOUT * 10, interval: 10})
        await new Promise(r => setTimeout(r, 150))

        // 1 seed + 1 verify. Without batching this would be 1 + 25.
        expect(loadDevicesPresentBefore).toHaveBeenCalledTimes(2)
    })

    it('promotes a device that heartbeats to US off the sweep list entirely', async () => {
        // Mongo keeps reporting BOTH as stale, so the only thing that can spare
        // serial-live from the swept path is the heartbeat having removed it from
        // the sweep set.
        //
        // Both paths write setDeviceAbsent to Mongo (presence: false must always
        // be persisted). What distinguishes the swept path is the extra
        // loadDevicesPresentBefore re-check — 1 seed query + 1 re-check = 2 calls
        // for serial-dead, while serial-live (promoted off sweptKeys by its
        // heartbeat) takes the ordinary reap path that never re-queries Mongo.
        loadDevicesPresentBefore.mockResolvedValue([
            row('provider-a', 'serial-live'),
            row('provider-a', 'serial-dead'),
        ])
        const h = await boot()

        await h.sendInit(Date.now() - 60_000)
        await vi.waitFor(() => expect(loadDevicesPresentBefore).toHaveBeenCalled(),
            {timeout: 2000, interval: 10})

        // A live device talks to us, refreshing its TTL from `now`.
        await h.heartbeat('provider-a', 'serial-live')

        // Wait until the processor has actually processed the heartbeat (presence
        // bumped) before relying on the TTL gap between the two devices.
        await vi.waitFor(() => expect(h.broadcastsOf(PRESENT_URL).length).toBeGreaterThanOrEqual(1),
            {timeout: HEARTBEAT_TIMEOUT * 4, interval: 10})

        // Wait past BOTH expiries: serial-dead at startedAt+TTL, and serial-live
        // one TTL after its heartbeat.
        await vi.waitFor(() => expect(h.broadcastsOf(ABSENT_URL).length).toBeGreaterThanOrEqual(2),
            {timeout: HEARTBEAT_TIMEOUT * 12, interval: 10})

        // Both were eventually reaped for lack of heartbeats and both wrote to Mongo.
        const reaped = h.broadcastsOf(ABSENT_URL)
            .map(e => Any.unpack(e.message!, DeviceAbsentMessage).serial)
        expect(reaped.sort()).toEqual(['serial-dead', 'serial-live'])

        // serial-dead triggered the swept re-check path: 1 seed + 1 re-check = 2.
        // serial-live was promoted off sweptKeys by its heartbeat and took the
        // ordinary reap path, which does not call loadDevicesPresentBefore again.
        expect(loadDevicesPresentBefore).toHaveBeenCalledTimes(2)
    })

    it('runs the sweep only once even if the proxy sends INIT repeatedly', async () => {
        loadDevicesPresentBefore.mockResolvedValue([])
        const h = await boot()

        await h.sendInit(Date.now() - 60_000)
        await vi.waitFor(() => expect(loadDevicesPresentBefore).toHaveBeenCalledTimes(1),
            {timeout: 2000, interval: 10})

        await h.sendInit(Date.now() - 60_000)
        await h.sendInit(Date.now() - 120_000)
        await new Promise(r => setTimeout(r, 200))

        expect(loadDevicesPresentBefore).toHaveBeenCalledTimes(1)
    })

    it('survives a malformed INIT timestamp without sweeping or crashing', async () => {
        loadDevicesPresentBefore.mockResolvedValue([row('provider-a', 'serial-1')])
        const h = await boot()

        await h.proxy.send([h.processorId, Buffer.from(KIND.INIT), Buffer.from('not-a-number')])
        await new Promise(r => setTimeout(r, HEARTBEAT_TIMEOUT * 2))

        expect(loadDevicesPresentBefore).not.toHaveBeenCalled()
        expect(setDeviceAbsent).not.toHaveBeenCalled()

        // The link is still healthy: a valid INIT afterwards still sweeps. (The
        // call count then grows past 1, because the seeded device's TTL expiry
        // triggers the legitimate re-check query.)
        await h.sendInit(Date.now() - 60_000)
        await vi.waitFor(() => expect(setDeviceAbsent).toHaveBeenCalledTimes(1),
            {timeout: HEARTBEAT_TIMEOUT * 8, interval: 10})
        expect((setDeviceAbsent.mock.calls[0] as any[])[0]).toBe('serial-1')
    })

    it('keeps working when the re-check query fails', async () => {
        loadDevicesPresentBefore
            .mockResolvedValueOnce([row('provider-a', 'serial-1')])
            .mockRejectedValue(new Error('mongo down'))
        const h = await boot()

        await h.sendInit(Date.now() - 60_000)
        await new Promise(r => setTimeout(r, HEARTBEAT_TIMEOUT * 4))

        // The failure is swallowed and logged; nothing is wrongly marked absent.
        expect(setDeviceAbsent).not.toHaveBeenCalled()
    })

    it('does not sweep at all if the proxy never sends an INIT', async () => {
        loadDevicesPresentBefore.mockResolvedValue([row('provider-a', 'serial-1')])
        await boot()

        await new Promise(r => setTimeout(r, HEARTBEAT_TIMEOUT * 3))

        expect(loadDevicesPresentBefore).not.toHaveBeenCalled()
        expect(setDeviceAbsent).not.toHaveBeenCalled()
    })
})
