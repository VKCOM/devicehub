import {EventEmitter} from 'node:events'
import {Duplex, PassThrough} from 'node:stream'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {ClientStream, handshake, makeKey, A_CNXN, A_OPEN, A_WRTE} from './adb-bridge/fakeClient.ts'
import {BridgeConnection} from '../../../../lib/units/device/plugins/adb-bridge/connection.ts'

vi.mock('../../../../lib/units/device/support/adb.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/base-device/support/transport.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/device/plugins/group.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/device/plugins/solo.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/base-device/support/urlformat.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/base-device/support/connector.js', () => ({default: {consume() {}}, DEVICE_TYPE: {ANDROID: 0}}))
vi.mock('../../../../lib/units/device/plugins/util/identity.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/device/plugins/util/data.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/device/resources/reverse.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/util/lifecycle.js', () => ({default: {observe: vi.fn(), fatal: vi.fn(), ending: false}}))

// The plugin's TCP server, minus the TCP: tests hand it connections themselves
const servers = vi.hoisted(() => [] as any[])
vi.mock('../../../../lib/units/device/plugins/adb-bridge/server.ts', async() => {
    const {EventEmitter} = await import('node:events')
    class FakeBridgeServer extends EventEmitter {
        connections: any[] = []
        listen = vi.fn(() => { queueMicrotask(() => this.emit('listening')); return this })
        end = vi.fn(() => { this.connections.forEach(connection => connection.end()); return this })
        close = vi.fn(() => { this.emit('close'); return this })
        constructor(public options: any) { super(); servers.push(this) }
    }
    return {BridgeServer: FakeBridgeServer}
})

const connect = (await import('../../../../lib/units/device/plugins/connect.js')).default
const lifecycle = (await import('../../../../lib/util/lifecycle.js')).default
const key = await makeKey()

const closing: Array<() => Promise<unknown>> = []
afterEach(async() => { for (const close of closing.splice(0)) await close(); vi.clearAllMocks() })

/**
 * A stream to the device-side reverse helper, which binds whatever port it is
 * asked to: answers `listen` with OK, as Helper.java does once the port is up.
 */
class HelperStream extends Duplex {
    written = ''
    _read() {}
    _write(chunk: Buffer, _encoding: string, callback: () => void) {
        this.written += chunk.toString()
        if (this.written.startsWith('listen ') && this.written.endsWith('\n')) {
            this.push('OK\n')
        }
        callback()
    }
}

async function setup(silent: boolean, keys?: string[], deviceFeatures?: string) {
    const group = Object.assign(new EventEmitter(), {keepalive: vi.fn()})
    let handlers: any
    const helperStreams: HelperStream[] = []
    const openLocal = vi.fn(async() => { const stream = new HelperStream(); helperStreams.push(stream); return stream })
    // One `adb shell` stream per helper launch; its end is the helper exiting
    const helpers: PassThrough[] = []
    const reverseHelper = {start: vi.fn(async() => { const out = new PassThrough(); helpers.push(out); return out })}
    const client = {
        getDevice: () => ({openLocal,
            getProperties: async() => ({'ro.product.name': 'test', 'ro.product.model': 'test', 'ro.product.device': 'test'})}),
        // The provider's adb server; it knows the device's features when given
        connection: async() => {
            if (deviceFeatures === undefined) throw new Error('not available')
            return {write() {}, socket: {destroy() {}},
                parser: {readCode: async() => 'OKAY', readValue: async() => deviceFeatures}}
        }
    }
    const connector = {init: (options: any) => { handlers = options.handlers }, stop: vi.fn(async() => {})}
    await connect.invoke({silent, serial: 'serial', connectPort: 7401}, client, {}, group,
        {}, () => 'localhost:7401', connector, {model: 'test'}, {name: {id: 'test'}}, reverseHelper)
    group.emit('join', {adbKeys: keys})
    await handlers.start()
    closing.push(() => handlers.stop())
    const server = servers.at(-1)
    const socket = () => {
        const stream = new ClientStream()
        const connection = new BridgeConnection(stream, server.options)
        server.connections.push(connection)
        server.emit('connection', connection)
        return {connection, stream}
    }
    return {group, server, socket, openLocal, helperStreams, helpers, reverseHelper, handlers}
}

describe('remote ADB authentication', () => {
    it.each([false, true])('allows a valid RSA client when owner has no saved keys (silent: %s)', async silent => {
        const h = await setup(silent, [])
        const {connection, stream} = h.socket()
        await handshake(stream, key)
        await vi.waitFor(() => expect(connection.authorized).toBe(true))
        expect(stream.received().at(-1)).toMatchObject({command: A_CNXN})
        expect(stream.received().at(-1)!.data!.toString()).toBe(
            'device::ro.product.name=test;ro.product.model=test;ro.product.device=test;features=delayed_ack')
    })

    // What the client may use: the device's features we carry, and delayed_ack
    it("advertises the device's features the bridge carries", async() => {
        const h = await setup(true, [], 'shell_v2,cmd,sendrecv_v2,openscreen_mdns')
        const {connection, stream} = h.socket()
        await handshake(stream, key)
        await vi.waitFor(() => expect(connection.authorized).toBe(true))
        expect(stream.received().at(-1)!.data!.toString()).toBe(
            'device::ro.product.name=test;ro.product.model=test;ro.product.device=test;' +
            'features=shell_v2,cmd,sendrecv_v2,delayed_ack')
    })

    it.each([
        [false, 'unknown key'], [true, 'unknown key'], [false, 'bad signature'], [true, 'bad signature'],
        [false, 'malformed key'], [true, 'malformed key']
    ] as const)('closes only the failed connection (silent: %s, %s) and accepts the next client', async(silent, reason) => {
        const h = await setup(silent, reason === 'unknown key' ? ['different'] : [key.fingerprint])
        const rejected = h.socket()
        await handshake(rejected.stream, key, {
            validSignature: reason !== 'bad signature',
            keyString: reason === 'malformed key' ? 'broken key\0' : key.publicKey
        })
        await vi.waitFor(() => expect(rejected.connection.ended).toBe(true))
        expect(rejected.connection.authorized).toBe(false)
        expect(h.server.close).not.toHaveBeenCalled()
        h.group.emit('join', {adbKeys: [key.fingerprint]})
        const accepted = h.socket()
        await handshake(accepted.stream, key)
        await vi.waitFor(() => expect(accepted.connection.authorized).toBe(true))
    })

    it('denies authentication after release', async() => {
        const h = await setup(true, [key.fingerprint])
        const accepted = h.socket()
        await handshake(accepted.stream, key)
        await vi.waitFor(() => expect(accepted.connection.authorized).toBe(true))
        h.group.emit('leave')
        const rejected = h.socket()
        await handshake(rejected.stream, key)
        await vi.waitFor(() => expect(rejected.connection.ended).toBe(true))
        expect(rejected.connection.authorized).toBe(false)
    })

    it('does not open a reverse tunnel before RSA authentication', async() => {
        const h = await setup(true, [])
        const {connection, stream} = h.socket()
        stream.send(A_OPEN, 1, 0, 'reverse:forward:tcp:7000;tcp:8000\0')
        await vi.waitFor(() => expect(connection.ended).toBe(true))
        expect(h.reverseHelper.start).not.toHaveBeenCalled()
        expect(h.openLocal).not.toHaveBeenCalled()
    })

    it('keeps the group alive on client activity', async() => {
        const h = await setup(true, [])
        const {stream} = h.socket()
        await handshake(stream, key)
        await vi.waitFor(() => expect(h.group.keepalive).toHaveBeenCalled())
    })
})

/** The reply payloads of the `reverse:` streams the bridge answered, in order. */
function replies(stream: ClientStream): string[] {
    return stream.received().filter(p => p.command === A_WRTE).map(p => p.data!.toString())
}

async function authorized(h: Awaited<ReturnType<typeof setup>>) {
    const {connection, stream} = h.socket()
    await handshake(stream, key)
    await vi.waitFor(() => expect(connection.authorized).toBe(true))
    return {connection, stream}
}

describe('reverse helper', () => {
    // Most sessions never `adb reverse`; the helper costs a process on the device
    it('starts the helper on the first reverse, not with the plugin', async() => {
        const h = await setup(true, [])
        const {stream} = await authorized(h)
        expect(h.reverseHelper.start).not.toHaveBeenCalled()

        stream.send(A_OPEN, 5, 0, 'reverse:forward:tcp:7000;tcp:8000\0')

        await vi.waitFor(() => expect(replies(stream)).toEqual(['OKAY']))
        expect(h.reverseHelper.start).toHaveBeenCalledOnce()
        expect(h.openLocal).toHaveBeenCalledWith('localabstract:devicehub-reverse')
        // Only the device port reaches the device; tcp:8000 is the user's
        expect(h.helperStreams[0].written).toBe('listen 7000\n')
    })

    it('uses the running helper for the next forward', async() => {
        const h = await setup(true, [])
        const {stream} = await authorized(h)

        stream.send(A_OPEN, 5, 0, 'reverse:forward:tcp:7000;tcp:8000\0')
        await vi.waitFor(() => expect(replies(stream)).toHaveLength(1))
        stream.send(A_OPEN, 6, 0, 'reverse:forward:tcp:7001;tcp:8001\0')
        await vi.waitFor(() => expect(replies(stream)).toHaveLength(2))

        expect(h.reverseHelper.start).toHaveBeenCalledOnce()
    })

    // A helper that cannot start fails the bind, with the reason, and nothing else
    it('answers FAIL when the helper cannot start, and tries again next time', async() => {
        const h = await setup(true, [])
        const {connection, stream} = await authorized(h)
        h.reverseHelper.start.mockRejectedValueOnce(new Error('Reverse helper did not start (exited): boom'))

        stream.send(A_OPEN, 5, 0, 'reverse:forward:tcp:7000;tcp:8000\0')
        await vi.waitFor(() => expect(replies(stream)).toHaveLength(1))
        expect(replies(stream)[0]).toMatch(/^FAIL....cannot bind listener: Reverse helper did not start/)
        expect(connection.ended).toBe(false)

        stream.send(A_OPEN, 6, 0, 'reverse:forward:tcp:7000;tcp:8000\0')
        await vi.waitFor(() => expect(replies(stream)).toHaveLength(2))
        expect(replies(stream)[1]).toBe('OKAY')
    })

    // The helper serves only `adb reverse`: the device, the user's adb
    // connection and the screen must not go down with it.
    it('keeps the device up when the helper dies and starts it again for the next reverse', async() => {
        const h = await setup(true, [])
        const {connection, stream} = await authorized(h)
        stream.send(A_OPEN, 5, 0, 'reverse:forward:tcp:7000;tcp:8000\0')
        await vi.waitFor(() => expect(replies(stream)).toHaveLength(1))

        // The helper exits: its shell stream ends, and so does every control stream
        h.helpers[0].end()
        h.helpers[0].resume()
        h.helperStreams[0].push(null)
        h.helperStreams[0].destroy()
        await new Promise(resolve => setImmediate(resolve))

        expect(lifecycle.fatal).not.toHaveBeenCalled()
        expect(connection.ended).toBe(false)

        // The forward was forgotten with its listener, so this is a fresh bind
        stream.send(A_OPEN, 6, 0, 'reverse:forward:tcp:7000;tcp:8000\0')
        await vi.waitFor(() => expect(h.reverseHelper.start).toHaveBeenCalledTimes(2))
        await vi.waitFor(() => expect(replies(stream)).toHaveLength(2))
        expect(h.helperStreams.at(-1)!.written).toBe('listen 7000\n')
    })

    // The device leaves the group: the forwards go, the device stops listening
    it('unbinds the forwards when the device is released', async() => {
        const h = await setup(true, [])
        const {stream} = await authorized(h)
        stream.send(A_OPEN, 5, 0, 'reverse:forward:tcp:7000;tcp:8000\0')
        await vi.waitFor(() => expect(replies(stream)).toHaveLength(1))

        h.group.emit('leave')

        expect(h.helperStreams[0].writableEnded).toBe(true)
    })

    // Remote connect stopped while the first `adb reverse` was starting the
    // helper: the helper that comes up afterwards is nobody's and must not stay
    it('does not keep a helper that finishes starting after the plugin stopped', async() => {
        const h = await setup(true, [])
        const {stream} = await authorized(h)
        let started!: (out: PassThrough) => void
        h.reverseHelper.start.mockImplementationOnce(() => new Promise(resolve => { started = resolve }))
        stream.send(A_OPEN, 5, 0, 'reverse:forward:tcp:7000;tcp:8000\0')
        await vi.waitFor(() => expect(h.reverseHelper.start).toHaveBeenCalled())

        await h.handlers.stop()
        const out = new PassThrough()
        started(out)
        await new Promise(resolve => setImmediate(resolve))

        expect(out.writableEnded).toBe(true)
        expect(h.openLocal).not.toHaveBeenCalled()
    })

    // Nothing is left on the device once remote connect stops
    it('stops the helper when the plugin stops', async() => {
        const h = await setup(true, [])
        const {stream} = await authorized(h)
        stream.send(A_OPEN, 5, 0, 'reverse:forward:tcp:7000;tcp:8000\0')
        await vi.waitFor(() => expect(replies(stream)).toHaveLength(1))

        await h.handlers.stop()

        expect(h.helperStreams[0].writableEnded).toBe(true)
        expect(h.helpers[0].writableEnded).toBe(true)
    })
})
