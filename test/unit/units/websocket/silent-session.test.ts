import {EventEmitter} from 'node:events'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {WireRouter} from '../../../../lib/wire/router.js'
import {SilentDeviceDispatcher} from '../../../../lib/units/websocket/support/silent-device-dispatcher.js'
import {DeviceTransport} from '../../../../lib/wire/device-transport.js'
import {TransactionManager} from '../../../../lib/wire/transmanager.js'
import {SilentDevices} from '../../../../lib/units/processor/silent-devices.js'
import {Any} from '../../../../lib/wire/google/protobuf/any.js'
import {Envelope, DeviceIdentityMessage, DeviceReadyMessage, ShellCommandMessage, TouchMoveMessage, DeviceLogcatEntryMessage, SilentDeviceEvent, SilentDeviceSnapshot} from '../../../../lib/wire/wire.js'
import {encodeDeviceFrame, deviceKey} from '../../../../lib/wire/frame.js'
import wireutil from '../../../../lib/wire/util.js'

const {keys} = vi.hoisted(() => ({keys: vi.fn(async () => [{fingerprint: 'key'}])}))
vi.mock('../../../../lib/units/websocket/middleware/auth.js', () => ({default: () => (_socket: any, next: any) => next()}))
vi.mock('../../../../lib/db/models/user/index.js', () => ({default: {getUserAdbKeys: keys}}))
const {registerSilentNamespace} = await import('../../../../lib/units/websocket/support/silent-session.js')

class Client extends EventEmitter {
    data: any = {}
    sent: Array<[string, ...any[]]> = []
    anyListeners: Function[] = []
    constructor(readonly handshake: any, readonly request: any) { super() }
    emit(event: string, ...args: any[]) { this.sent.push([event, ...args]); return true }
    receive(event: string, ...args: any[]) {
        this.anyListeners.forEach(fn => fn(event, ...args))
        super.emit(event, ...args)
    }
    onAny(fn: Function) { this.anyListeners.push(fn) }
    disconnect() { super.emit('disconnect') }
    result(rc: string) { return this.sent.find(([e, channel]) => e === 'tx.done' && channel === rc)?.[2] }
}
const closers: Array<() => any> = []
afterEach(async () => { await Promise.all(closers.splice(0).map(close => close())); vi.restoreAllMocks(); vi.clearAllMocks() })

function harness() {
    const app = new EventEmitter() as any
    const workers = new Map<string, DeviceTransport>()
    let commands = 0
    app.sendCommand = (provider: string, serial: string, bytes: Uint8Array) => {
        commands++
        const frames = encodeDeviceFrame(provider, serial, Buffer.from(bytes))
        frames.splice(3, 0, Buffer.from('app'))
        const worker = workers.get(deviceKey(provider, serial)) as any
        worker?.dealer.emit('frames', frames)
    }
    const processor = new SilentDevices(10_000, bytes => app.emit('broadcast', Buffer.from(bytes)))
    closers.push(() => processor.close())
    const addWorker = (provider: string, allowed: string[] = []) => {
        const dealer = new EventEmitter() as any
        dealer.flush = async () => {}
        dealer.close = async () => {}
        dealer.send = async (frames: Buffer[]) => {
            const bytes = frames.at(-1)!
            const envelope = Envelope.fromBinary(bytes)
            if (frames[0].toString() === 'R') app.emit('message', envelope.channel, bytes)
            else processor.consume(provider, 'same', envelope, bytes => dealer.emit('frames', encodeDeviceFrame(provider, 'same', Buffer.from(bytes))))
        }
        const worker = new DeviceTransport(dealer, {providerName: provider, serial: 'same', allowedEmails: allowed})
        worker.silent!.bindGroup({joinExclusive: async () => {}, leaveExclusive: async () => {}})
        worker.send([wireutil.global, wireutil.pack(DeviceIdentityMessage, DeviceIdentityMessage.create({serial: 'same', manufacturer: 'Google', platform: 'Android', display: {url: 'ws://screen'}}))])
        worker.send([wireutil.global, wireutil.pack(DeviceReadyMessage, {serial: 'same', channel: 'solo'})])
        const executed = vi.fn()
        worker.on('message', (channel, bytes) => {
            const envelope = Envelope.fromBinary(bytes)
            if (Any.contains(envelope.message!, ShellCommandMessage)) {
                executed(Any.unpack(envelope.message!, ShellCommandMessage).command)
                worker.send([channel, wireutil.reply('same').okay(provider)])
            }
        })
        workers.set(deviceKey(provider, 'same'), worker)
        closers.push(() => worker.close())
        return {worker, executed}
    }
    const namespace = new EventEmitter() as any
    const middleware: Function[] = []
    namespace.use = (fn: Function) => middleware.push(fn)
    const events = new SilentDeviceDispatcher(error => { throw error })
    const route = new WireRouter().on(SilentDeviceEvent, (_channel, event) => events.dispatch(event)).handler()
    app.on('broadcast', (bytes: Buffer) => route('', bytes))
    closers.push(() => { events.close(); app.removeAllListeners() })
    registerSilentNamespace({of: () => namespace} as any, app, new TransactionManager(app), events, {secret: 'secret'})
    const connect = async (provider: string, email: string) => {
        const client = new Client({auth: {provider, serial: 'same'}}, {user: {email, name: email, group: 'g'}, internalJwt: 'jwt'})
        for (const fn of middleware) await new Promise<void>((resolve, reject) => fn(client, (error?: Error) => error ? reject(error) : resolve()))
        namespace.emit('connection', client)
        closers.push(() => client.disconnect())
        return client
    }
    return {app, addWorker, connect, commands: () => commands}
}

describe('silent Socket.IO -> worker integration', () => {
    it('keeps one broadcast listener for many sockets and encodes input commands once without lookups', async () => {
        const h = harness()
        h.addWorker('p')
        const clients: Client[] = []
        for (let i = 0; i < 25; i++) clients.push(await h.connect('p', 'owner'))
        expect(h.app.listenerCount('broadcast')).toBe(1)
        const owner = clients[0]
        owner.receive('group.invite', 'same', 'acquire')
        await vi.waitFor(() => expect(owner.result('acquire')?.success).toBe(true))
        const send = vi.spyOn(h.app, 'sendCommand').mockImplementation(() => {})
        const encode = vi.spyOn(Envelope, 'toBinary'), decode = vi.spyOn(Envelope, 'fromBinary')
        keys.mockClear()
        owner.receive('input.touchMove', 'same', {seq: 1, contact: 0, x: 0.5, y: 0.6, pressure: 0.7})
        expect(encode).toHaveBeenCalledTimes(1)
        expect(decode).not.toHaveBeenCalled()
        expect(send).toHaveBeenCalledTimes(1)
        expect(keys).not.toHaveBeenCalled()
        const [provider, serial, bytes] = send.mock.calls[0]
        expect([provider, serial]).toEqual(['p', 'same'])
        const envelope = Envelope.fromBinary(bytes)
        expect(envelope.silentCommand?.leaseId).toBeTruthy()
        expect(Any.unpack(envelope.message!, TouchMoveMessage)).toMatchObject({seq: 1, x: 0.5})
        clients.forEach(client => client.disconnect())
        expect(h.app.listenerCount('broadcast')).toBe(1)
    })
    it('authorizes once, enforces one owner, and executes subsequent commands without a device lookup', async () => {
        const h = harness()
        const {executed} = h.addWorker('p')
        const owner = await h.connect('p', 'owner'), competitor = await h.connect('p', 'other')
        owner.receive('shell.command', 'same', 'early', {command: 'blocked', timeout: 1000})
        await vi.waitFor(() => expect(owner.result('early')?.success).toBe(false))
        owner.receive('group.invite', 'same', 'acquire', {})
        await vi.waitFor(() => expect(owner.result('acquire')?.success).toBe(true))
        competitor.receive('group.invite', 'same', 'compete', {})
        await vi.waitFor(() => expect(competitor.result('compete')?.data).toBe('busy'))
        const before = h.commands()
        owner.receive('shell.command', 'same', 'shell', {command: 'echo hello', timeout: 1000})
        await vi.waitFor(() => expect(owner.result('shell')?.data).toBe('p'))
        expect(h.commands() - before).toBe(1)
        expect(executed).toHaveBeenCalledExactlyOnceWith('echo hello')
        const body = JSON.parse(owner.result('acquire').body)
        expect(body).not.toHaveProperty('leaseId')
        owner.receive('group.kick', 'same', 'release', {})
        await vi.waitFor(() => expect(owner.result('release')?.success).toBe(true))
        competitor.receive('group.invite', 'same', 'retry', {})
        await vi.waitFor(() => expect(competitor.result('retry')?.success).toBe(true))
        owner.receive('shell.command', 'same', 'stale', {command: 'stale'})
        await vi.waitFor(() => expect(owner.result('stale')?.success).toBe(false))
        expect(executed).toHaveBeenCalledTimes(1)
    })

    it('separates equal serials, checks ACL on attach, and sends logs only to the active owner', async () => {
        const h = harness()
        const first = h.addWorker('p1', ['allowed']), second = h.addWorker('p2')
        await expect(h.connect('p1', 'denied')).rejects.toThrow('forbidden')
        const a = await h.connect('p1', 'allowed'), b = await h.connect('p2', 'allowed')
        const viewer = await h.connect('p2', 'viewer')
        a.receive('group.invite', 'same', 'a'); b.receive('group.invite', 'same', 'b')
        await vi.waitFor(() => { expect(a.result('a')?.success).toBe(true); expect(b.result('b')?.success).toBe(true) })
        first.worker.send([wireutil.global, wireutil.pack(DeviceLogcatEntryMessage, DeviceLogcatEntryMessage.create({serial: 'same', message: 'first'}))])
        second.worker.send([wireutil.global, wireutil.pack(DeviceLogcatEntryMessage, DeviceLogcatEntryMessage.create({serial: 'same', message: 'second'}))])
        expect(a.sent.filter(([e]) => e === 'logcat.entry').map(([, data]) => data.message)).toEqual(['first'])
        expect(b.sent.filter(([e]) => e === 'logcat.entry').map(([, data]) => data.message)).toEqual(['second'])
        expect(viewer.sent.filter(([e]) => e === 'logcat.entry')).toEqual([])
    })
    it('ignores a delayed pre-acquisition snapshot after the acquisition reply', async () => {
        const h = harness()
        const {worker, executed} = h.addWorker('p')
        const owner = await h.connect('p', 'owner')
        const context = worker.silent!.context()
        const snapshot = worker.silent!.describe({email: 'owner', name: 'owner', group: 'g', adbKeys: []})
        owner.receive('group.invite', 'same', 'acquire')
        await vi.waitFor(() => expect(owner.result('acquire')?.success).toBe(true))
        h.app.emit('broadcast', wireutil.pack(SilentDeviceEvent, {providerName: 'p', serial: 'same', context,
            event: Any.pack({json: JSON.stringify(snapshot)}, SilentDeviceSnapshot)}))
        owner.receive('shell.command', 'same', 'after', {command: 'still owned', timeout: 1000})
        await vi.waitFor(() => expect(owner.result('after')?.success).toBe(true))
        expect(executed).toHaveBeenCalledExactlyOnceWith('still owned')
    })

})
