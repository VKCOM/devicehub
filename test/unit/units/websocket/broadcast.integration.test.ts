import {describe, it, expect, afterEach} from 'vitest'
import {RouterSocket, DealerSocket} from '../../../../lib/util/zmqsocket.ts'
import {AppTransport} from '../../../../lib/wire/app-transport.ts'
import {WireRouter} from '../../../../lib/wire/router.ts'
import {ProxyRouting} from '../../../../lib/units/proxy/routing.ts'
import {encodeBroadcast} from '../../../../lib/wire/frame.ts'
import {DeviceChangeMessage} from '../../../../lib/wire/wire.ts'
import wireutil from '../../../../lib/wire/util.ts'
import {ClientDispatcher} from '../../../../lib/units/websocket/support/clientDispatcher.ts'

// Integration-style test: a broadcast published to a real proxy ROUTER is fanned
// out to a broadcast-receiver DEALER (as the websocket unit does), decoded ONCE
// by a single unit-wide WireRouter, and dispatched through ClientDispatcher to every
// registered connection. This proves the "one transport listener, per-socket
// dispatch" model end to end (no per-client WireRouter).

const nextPort = (() => {
    let p = 16300
    return () => p++
})()

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

describe('websocket broadcast fan-out <-> proxy', () => {
    const open: Array<{close: () => any}> = []
    afterEach(async () => {
        await Promise.all(open.splice(0).map(s => Promise.resolve(s.close()).catch(() => {})))
    })

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

        const dealer = new DealerSocket({routingId: 'ws-1', probeRouter: true})
        dealer.connect(addr)
        const transport = new AppTransport(dealer)
        open.push(transport)
        return {addr, router, routing, transport}
    }

    it('delivers a broadcast to every registered connection through one WireRouter', async () => {
        const {router, routing, transport} = await setup()

        // The unit builds ONE hub + ONE WireRouter for the whole process.
        const hub = new ClientDispatcher()
        const route = new WireRouter()
            .on(DeviceChangeMessage, (ch, m) => hub.dispatch('DeviceChangeMessage', ch, m))
            .handler()
        transport.on('broadcast', (body: Buffer) => route('', body))

        // Two independent connections register their per-type handlers.
        const seenA: any[] = []
        const seenB: any[] = []
        hub.add('a', {DeviceChangeMessage: (_ch, m) => seenA.push(m.device?.serial)})
        hub.add('b', {DeviceChangeMessage: (_ch, m) => seenB.push(m.device?.serial)})

        const learn = nextRealFrames(router)
        transport.registerBroadcast()
        await learn

        const gotBoth = new Promise<void>((resolve) => {
            const check = () => {
                if (seenA.length && seenB.length) {
                    resolve()
                }
            }
            hub.add('probe', {DeviceChangeMessage: () => setImmediate(check)})
        })

        // groups-engine/processor publishes a DeviceChange broadcast to the proxy.
        const env = Buffer.from(wireutil.pack(DeviceChangeMessage, {
            device: {serial: 'serial-42'},
            action: 'updated',
            oldOriginGroupId: '',
            timeStamp: 0,
        } as any))
        for (const {target, frames} of routing.route([
            Buffer.from('source-1'),
            ...encodeBroadcast(env),
        ])) {
            await router.send([target, ...frames])
        }

        await gotBoth
        expect(seenA).toEqual(['serial-42'])
        expect(seenB).toEqual(['serial-42'])
    })
})
