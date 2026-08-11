import {describe, it, expect, afterEach} from 'vitest'
import {RouterSocket, DealerSocket} from '../../../lib/util/zmqsocket.ts'
import {AppTransport} from '../../../lib/wire/app-transport.ts'
import {ProxyRouting} from '../../../lib/units/proxy/routing.ts'
import {KIND, encodeBroadcast, deviceKey} from '../../../lib/wire/frame.ts'
import {Envelope} from '../../../lib/wire/wire.ts'
import {DeviceHeartbeatMessage} from '../../../lib/wire/wire.ts'
import wireutil from '../../../lib/wire/util.ts'

// Integration-style test over real in-process TCP sockets: an app-side
// AppTransport (DEALER) talking to a real proxy ROUTER driven by the pure
// ProxyRouting. No ZMQ mocking — this exercises the S-registration and B/D
// paths end to end, the way api/websocket/log will use them.

const nextPort = (() => {
    let p = 16100
    return () => p++
})()

// A ROUTER receiving from a probeRouter=true DEALER sees an initial empty probe
// ([identity]) before the first real message. Skip probe/empty frames.
const nextRealFrames = (sock: {on: (e: string, fn: (f: Buffer[]) => void) => void; removeListener: (e: string, fn: (f: Buffer[]) => void) => void}): Promise<Buffer[]> =>
    new Promise((resolve) => {
        const onFrames = (frames: Buffer[]) => {
            if (frames.length <= 1 || (frames.length === 2 && frames[1].length === 0)) {
                return
            }
            sock.removeListener('frames', onFrames)
            resolve(frames)
        }
        sock.on('frames', onFrames)
    })

describe('AppTransport <-> proxy ROUTER', () => {
    const open: Array<{close: () => any}> = []
    afterEach(async () => {
        await Promise.all(open.splice(0).map(s => Promise.resolve(s.close()).catch(() => {})))
    })

    // A minimal real proxy: a RouterSocket wired to the pure ProxyRouting, the
    // same glue lib/units/proxy/index.ts uses (without the lifecycle globals).
    const setup = async () => {
        const addr = `tcp://127.0.0.1:${nextPort()}`
        const routing = new ProxyRouting()
        const router = new RouterSocket()
        router.on('frames', async (frames: Buffer[]) => {
            for (const {target, frames: out} of routing.route(frames)) {
                await router.send([target, ...out]).catch(() => {})
            }
        })
        await router.bind(addr)
        open.push(router)

        const dealer = new DealerSocket({routingId: 'app-1', probeRouter: true})
        dealer.connect(addr)
        const transport = new AppTransport(dealer)
        open.push(transport)
        return {addr, router, routing, transport}
    }

    it('registers as a broadcast receiver (S) and then receives a broadcast (B)', async () => {
        const {router, routing, transport} = await setup()

        // The app registers itself; the proxy learns the receiver from the [S].
        const learn = nextRealFrames(router)
        transport.registerBroadcast()
        await learn // the proxy has now processed the [S] frame

        const gotBroadcast = new Promise<Buffer>((resolve) => {
            transport.once('broadcast', (body: Buffer) => resolve(body))
        })

        // A broadcast source (processor/groups-engine) publishes a B to the
        // proxy; the proxy fans it out to every registered receiver.
        const env = Buffer.from(wireutil.pack(DeviceHeartbeatMessage, {serial: 'serial-1'}))
        for (const {target, frames} of routing.route([
            Buffer.from('source-1'),
            ...encodeBroadcast(env),
        ])) {
            await router.send([target, ...frames])
        }

        const body = await gotBroadcast
        const decoded = Envelope.fromBinary(body)
        expect(decoded.message?.typeUrl).toContain('DeviceHeartbeatMessage')
    })

    it('sends a device command (D) that the proxy forwards to the owning processor', async () => {
        const {addr, router, routing, transport} = await setup()

        // Stand up a fake processor DEALER and announce it owns provider-a, so
        // the proxy has a route for the command.
        const processor = new DealerSocket({routingId: 'proc-1', probeRouter: true})
        processor.connect(addr)
        open.push(processor)

        const announced = nextRealFrames(router)
        await processor.send([Buffer.from(KIND.ANNOUNCE), Buffer.from('provider-a')])
        await announced // proxy learned provider-a -> proc-1

        // The processor should receive the forwarded command with the app's
        // routingId pushed onto the reply-path.
        const gotCommand = nextRealFrames(processor)

        const correlationId = 'txn_app'
        const commandEnv = Buffer.from(wireutil.tr(correlationId, DeviceHeartbeatMessage, {serial: 'serial-1'}))
        transport.sendCommand('provider-a', 'serial-1', commandEnv)

        const frames = await gotCommand
        // [D, providerName, serial, ...replyPath, envelope]
        expect(frames[0].toString()).toBe(KIND.DEVICE)
        expect(frames[1].toString()).toBe('provider-a')
        expect(frames[2].toString()).toBe('serial-1')
        // the proxy pushed the app DEALER routingId onto the reply-path
        expect(frames[3].toString()).toBe('app-1')
        const decoded = Envelope.fromBinary(frames[frames.length - 1])
        expect(decoded.channel).toBe(correlationId)
    })

    it('delivers a reply (R) back to the app as a message carrying the correlationId', async () => {
        const {addr, router, routing, transport} = await setup()

        // Register + announce a processor so the proxy has both a receiver and a
        // route (mirrors the full topology).
        const processor = new DealerSocket({routingId: 'proc-1', probeRouter: true})
        processor.connect(addr)
        open.push(processor)
        const announced = nextRealFrames(router)
        await processor.send([Buffer.from(KIND.ANNOUNCE), Buffer.from('provider-a')])
        await announced

        // Send a command so the proxy records the app on the reply-path.
        const gotCommand = nextRealFrames(processor)
        const correlationId = 'txn_reply'
        transport.sendCommand('provider-a', 'serial-1',
            Buffer.from(wireutil.tr(correlationId, DeviceHeartbeatMessage, {serial: 'serial-1'})))
        const command = await gotCommand
        // reply-path is everything between serial (idx 2) and the body.
        const replyPath = command.slice(3, command.length - 1)

        const gotReply = new Promise<{channel: string; body: Buffer}>((resolve) => {
            transport.once('message', (channel: string, body: Buffer) => resolve({channel, body}))
        })

        // The processor replies up: [R, ...replyPath, envelope]. The proxy pops
        // the app off the reply-path and delivers [R, envelope] to the app.
        const replyEnv = Buffer.from(Envelope.toBinary({
            ...Envelope.fromBinary(Buffer.from(wireutil.reply('serial-1').okay('success'))),
            channel: correlationId,
        }))
        await processor.send([Buffer.from(KIND.REPLY), ...replyPath, replyEnv])

        const reply = await gotReply
        expect(reply.channel).toBe(correlationId)
        const decoded = Envelope.fromBinary(reply.body)
        expect(decoded.message?.typeUrl).toContain('TransactionDoneMessage')
    })
})
