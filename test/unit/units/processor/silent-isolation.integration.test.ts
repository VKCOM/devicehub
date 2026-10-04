import {afterEach, describe, expect, it, vi} from 'vitest'

const {writes, loadAdbPort, loadPresent} = vi.hoisted(() => ({writes: vi.fn(),
    loadAdbPort: vi.fn(async () => ({adbPort: 5556})), loadPresent: vi.fn(async (): Promise<any[]> => [])}))
vi.mock('../../../../lib/db/index.js', () => ({default: {ensureConnectivity: (fn: any) => fn, connect: async () => ({})}}))
vi.mock('../../../../lib/db/models/all/index.js', () => ({default: new Proxy({}, {get: (_target, name) =>
    async (...args: any[]) => { writes(name, ...args); return {} }
})}))
vi.mock('../../../../lib/db/models/device/index.js', () => ({default: {loadAdbPort, loadDevicesPresentBefore: loadPresent}}))
vi.mock('../../../../lib/db/models/user/index.js', () => ({default: {}}))

const {RouterSocket, DealerSocket} = await import('../../../../lib/util/zmqsocket.js')
const {DeviceTransport} = await import('../../../../lib/wire/device-transport.js')
const {encodeEvent, encodeInit, deviceKey} = await import('../../../../lib/wire/frame.js')
const {Envelope, InitializeIosDeviceState, DeviceIntroductionMessage, DeviceHeartbeatMessage, DeviceReadyMessage,
    BatteryEvent, DeviceStatusMessage, DeviceStatus, ResolveAdbPortRequest, ResolveAdbPortResponse, SilentDeviceEvent, DeviceAbsentMessage} =
    await import('../../../../lib/wire/wire.js')
const {Any} = await import('../../../../lib/wire/google/protobuf/any.js')
const wireutil = (await import('../../../../lib/wire/util.js')).default
const processorUnit = (await import('../../../../lib/units/processor/index.js')).default

let port = 19600
const closing: Array<() => any> = []
afterEach(async () => {
    for (const close of closing.splice(0).reverse()) await close()
    vi.clearAllMocks()
    loadPresent.mockReset().mockResolvedValue([])
})

async function boot() {
    const proxyAddress = `tcp://127.0.0.1:${port++}`, deviceAddress = `tcp://127.0.0.1:${port++}`
    const proxy = new RouterSocket()
    await proxy.bind(proxyAddress)
    closing.push(() => proxy.close())
    const broadcasts: any[] = []
    let identify!: (identity: Buffer) => void
    const identity = new Promise<Buffer>(resolve => { identify = resolve })
    proxy.on('frames', frames => {
        if (frames[1]?.toString() === 'H') identify(frames[0])
        if (frames[1]?.toString() === 'B') broadcasts.push(Envelope.fromBinary(frames.at(-1)!))
    })
    const processor = await processorUnit({name: 'silent-isolation', endpoints: {proxy: [proxyAddress], deviceRouter: deviceAddress},
        heartbeatTimeout: 200, publicIp: '127.0.0.1'} as any)
    closing.push(() => processor.shutdown())
    const worker = (provider: string, silent: boolean) => {
        const dealer = new DealerSocket({routingId: deviceKey(provider, 'same'), probeRouter: true})
        dealer.connect(deviceAddress)
        const transport = new DeviceTransport(dealer, silent ? {providerName: provider, serial: 'same'} : undefined)
        closing.push(() => transport.close())
        return {dealer, transport}
    }
    return {worker, broadcasts, initialize: async () => proxy.send([await identity, ...encodeInit(Date.now() - 60_000)])}
}

describe('processor silent isolation with real ZMQ and mocked Mongo', () => {
    it.each(['seed', 'recheck'])('keeps a silent address out of a delayed startup %s result', async (phase) => {
        const stale = [{serial: 'same', provider: {name: 'hidden'}}]
        let resolveRead!: (rows: any[]) => void
        if (phase === 'recheck') loadPresent.mockResolvedValueOnce(stale)
        loadPresent.mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve }))
        const h = await boot()
        await h.initialize()
        await vi.waitFor(() => expect(loadPresent).toHaveBeenCalledTimes(phase === 'seed' ? 1 : 2))
        const silent = h.worker('hidden', true)
        silent.transport.send([wireutil.global, wireutil.pack(BatteryEvent, BatteryEvent.create({serial: 'same', level: 50}))])
        await vi.waitFor(() => expect(h.broadcasts.some(e => Any.contains(e.message, SilentDeviceEvent))).toBe(true))
        resolveRead(stale)
        await vi.waitFor(() => expect(h.broadcasts.some(e => Any.contains(e.message, SilentDeviceEvent) &&
            Any.contains(Any.unpack(e.message, SilentDeviceEvent).event!, DeviceAbsentMessage))).toBe(true))
        expect(writes).not.toHaveBeenCalled()
    })
    it('never dispatches early iOS/Android state or silent timeout into Mongo for an equal serial', async () => {
        const h = await boot()
        const ordinary = h.worker('normal', false), silent = h.worker('hidden', true)
        ordinary.transport.send([wireutil.global, wireutil.pack(DeviceHeartbeatMessage, {serial: 'same'})])
        await vi.waitFor(() => expect(writes).toHaveBeenCalledWith('setDevicePresent', 'same', expect.any(Number)))
        // Refresh ordinary presence immediately before the silent events.
        ordinary.transport.send([wireutil.global, wireutil.pack(DeviceHeartbeatMessage, {serial: 'same'})])
        const start = writes.mock.calls.length
        for (const [type, value] of [
            [InitializeIosDeviceState, {serial: 'same', options: {name: 'iPhone'}}],
            [DeviceStatusMessage, {serial: 'same', status: DeviceStatus.CONNECTING}],
            [DeviceIntroductionMessage, {serial: 'same', silent: true}],
            [DeviceReadyMessage, {serial: 'same', channel: 'c'}],
            [BatteryEvent, {serial: 'same', level: 75}],
            [DeviceHeartbeatMessage, {serial: 'same'}]
        ] as const) silent.transport.send([wireutil.global, wireutil.pack(type as any, (type as any).create(value))])
        await vi.waitFor(() => expect(h.broadcasts.some(e => Any.contains(e.message, SilentDeviceEvent))).toBe(true))
        expect(writes.mock.calls.slice(start)).toEqual([])
        await vi.waitFor(() => expect(h.broadcasts.some(e => Any.contains(e.message, SilentDeviceEvent) &&
            Any.contains(Any.unpack(e.message, SilentDeviceEvent).event!, DeviceAbsentMessage))).toBe(true), {timeout: 1500})
        // The ordinary worker may time out, but there can be only its single DB write.
        await vi.waitFor(() => expect(writes.mock.calls.filter(([name]) => name === 'setDeviceAbsent')).toHaveLength(1))
        expect(writes.mock.calls.every(([name]) => ['setDevicePresent', 'setDeviceAbsent'].includes(name))).toBe(true)
    })

    it('resolves a normal ADB port using the routing pair and denies silent lookup without Mongo', async () => {
        const h = await boot(), normal = h.worker('normal', false), silent = h.worker('hidden', true)
        const replies: any[] = []
        for (const worker of [normal, silent]) worker.dealer.on('frames', frames => {
            const envelope = Envelope.fromBinary(frames.at(-1)!)
            if (envelope.message && Any.contains(envelope.message, ResolveAdbPortResponse)) replies.push(Any.unpack(envelope.message, ResolveAdbPortResponse))
        })
        await normal.dealer.send(encodeEvent(Buffer.from(wireutil.pack(ResolveAdbPortRequest, {requestId: 'normal'}))))
        silent.transport.send([wireutil.global, wireutil.pack(ResolveAdbPortRequest, {requestId: 'silent'})])
        await vi.waitFor(() => expect(replies).toHaveLength(2))
        expect(loadAdbPort).toHaveBeenCalledExactlyOnceWith('normal', 'same')
        expect(replies).toContainEqual({requestId: 'normal', adbPort: 5556})
        expect(replies.find(r => r.requestId === 'silent').error).toContain('Silent')
    })
})
