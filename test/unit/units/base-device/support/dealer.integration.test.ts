import {describe, it, expect, afterEach} from 'vitest'
import {RouterSocket, DealerSocket} from '../../../../../lib/util/zmqsocket.ts'
import {DeviceTransport} from '../../../../../lib/wire/device-transport.ts'
import {deviceKey, KIND} from '../../../../../lib/wire/frame.ts'
import {Envelope} from '../../../../../lib/wire/wire.ts'
import {DeviceHeartbeatMessage, TransactionDoneMessage} from '../../../../../lib/wire/wire.ts'
import wireutil from '../../../../../lib/wire/util.ts'

// Integration-style test over real in-process TCP sockets: the device-side
// DeviceDealer (over a real DEALER) talking to a ROUTER that stands in for the
// processor. Drives the real public interface — no ZMQ mocking.

const nextPort = (() => {
    let p = 15900
    return () => p++
})()

const nextFrames = (sock: {once: (e: string, fn: (f: Buffer[]) => void) => void}): Promise<Buffer[]> =>
    new Promise((resolve) => sock.once('frames', resolve))

// A ROUTER receiving from a probeRouter=true DEALER sees an initial empty probe
// message ([identity]) before the first real one. Skip probe/empty frames.
const nextRealFrames = (sock: {on: (e: string, fn: (f: Buffer[]) => void) => void; removeListener: (e: string, fn: (f: Buffer[]) => void) => void}): Promise<Buffer[]> =>
    new Promise((resolve) => {
        const onFrames = (frames: Buffer[]) => {
            // [identity] alone, or [identity, emptyBody] is a probe/keepalive.
            if (frames.length <= 1 || (frames.length === 2 && frames[1].length === 0)) {
                return
            }
            sock.removeListener('frames', onFrames)
            resolve(frames)
        }
        sock.on('frames', onFrames)
    })

describe('DeviceDealer <-> processor ROUTER', () => {
    const open: Array<{close: () => any}> = []
    afterEach(async () => {
        await Promise.all(open.splice(0).map(s => Promise.resolve(s.close()).catch(() => {})))
    })

    const setup = async () => {
        const addr = `tcp://127.0.0.1:${nextPort()}`
        const router = new RouterSocket()
        await router.bind(addr)
        open.push(router)

        const dealer = new DealerSocket({
            routingId: deviceKey('provider-a', 'serial-1'),
            probeRouter: true,
        })
        dealer.connect(addr)
        const support = new DeviceTransport(dealer)
        open.push(support)
        return {router, support}
    }

    it('sends a device event up as [E, envelope] carrying the device identity', async () => {
        const {router, support} = await setup()

        const received = nextRealFrames(router)
        support.send([wireutil.global, Buffer.from(wireutil.pack(DeviceHeartbeatMessage, {serial: 'serial-1'}))])

        const frames = await received
        // ROUTER prepends the device identity (deviceKey).
        expect(frames[0].toString()).toBe(deviceKey('provider-a', 'serial-1'))
        // A device only ever speaks to its processor: everything that is not a
        // reply travels up as a single "E" event.
        expect(frames[1].toString()).toBe(KIND.EVENT)
        // The body is the heartbeat envelope (no selector frame for E).
        const env = Envelope.fromBinary(frames[frames.length - 1])
        expect(env.message?.typeUrl).toContain('DeviceHeartbeatMessage')
    })

    it('receives a processor-originated message with an EMPTY reply-path (registration handshake)', async () => {
        // Regression: the processor used to answer with a bare [identity,
        // envelope] (no KIND frame), which the device silently dropped — so
        // registration only ever completed via a 15s timeout. A
        // processor-originated message must arrive as [D, prov, serial, env]
        // with an empty reply-path and be delivered to the plugin layer.
        const {router, support} = await setup()

        const learn = nextRealFrames(router)
        support.send([wireutil.global, Buffer.from(wireutil.pack(DeviceHeartbeatMessage, {serial: 'serial-1'}))])
        const deviceId = (await learn)[0]

        const gotMessage = new Promise<Buffer>((resolve) => {
            support.once('message', (_channel: string, envelope: Buffer) => resolve(envelope))
        })

        // Processor replies down the SAME way it frames a forwarded command,
        // but with NO reply-path: [deviceId, D, prov, serial, envelope].
        const registered = Buffer.from(wireutil.pack(TransactionDoneMessage, {source: 'x', seq: 0, success: true, data: 'ok'}))
        await router.send([
            deviceId,
            Buffer.from(KIND.DEVICE),
            Buffer.from('provider-a'),
            Buffer.from('serial-1'),
            registered,
        ])

        const env = Envelope.fromBinary(await gotMessage)
        expect(env.message?.typeUrl).toContain('TransactionDoneMessage')
    })

    it('receives a device-directed command and replies R with the same reply-path', async () => {
        const {router, support} = await setup()

        // Let the ROUTER learn the device identity first (probeRouter may already
        // have, but a real send is deterministic).
        const learn = nextRealFrames(router)
        support.send([wireutil.global, Buffer.from(wireutil.pack(DeviceHeartbeatMessage, {serial: 'serial-1'}))])
        const deviceId = (await learn)[0]

        // The plugin layer listens for the inbound command's (channel, envelope).
        const correlationId = 'txn_integration'
        const gotCommand = new Promise<{channel: string; envelope: Buffer}>((resolve) => {
            support.once('message', (channel: string, envelope: Buffer) =>
                resolve({channel, envelope}))
        })

        // Processor sends a command down: [deviceId, D, prov, serial, ...replyPath, env]
        const commandEnv = Buffer.from(wireutil.tr(correlationId, DeviceHeartbeatMessage, {serial: 'serial-1'}))
        await router.send([
            deviceId,
            Buffer.from(KIND.DEVICE),
            Buffer.from('provider-a'),
            Buffer.from('serial-1'),
            Buffer.from('api-1'), // reply-path
            commandEnv,
        ])

        const cmd = await gotCommand
        expect(cmd.channel).toBe(correlationId)

        // The plugin replies on that channel.
        const reply = nextRealFrames(router)
        support.send([correlationId, Buffer.from(wireutil.reply('serial-1').okay('success'))])

        const frames = await reply
        expect(frames[0].toString()).toBe(deviceKey('provider-a', 'serial-1')) // ROUTER identity
        expect(frames[1].toString()).toBe(KIND.REPLY)
        expect(frames[2].toString()).toBe('api-1') // reply-path preserved
        // The reply envelope carries the correlationId so the api can match it.
        const env = Envelope.fromBinary(frames[frames.length - 1])
        expect(env.channel).toBe(correlationId)
        expect(env.message?.typeUrl).toContain('TransactionDoneMessage')
    })
})
