import {describe, it, expect, afterEach} from 'vitest'
import {RouterSocket, DealerSocket} from '../../../lib/util/zmqsocket.ts'

// Integration-style tests over real in-process TCP sockets. This is the thin
// ROUTER/DEALER layer over native zeromq v6 (NOT the legacy v5-compatible
// SocketWrapper). We drive the real public interface, no ZMQ mocking.

const nextPort = (() => {
    let p = 15700
    return () => p++
})()

const nextFrames = (sock: {once: (e: string, fn: (f: Buffer[]) => void) => void}): Promise<Buffer[]> =>
    new Promise((resolve) => sock.once('frames', resolve))

describe('RouterSocket / DealerSocket', () => {
    const open: Array<{close: () => Promise<void>}> = []
    afterEach(async () => {
        await Promise.all(open.splice(0).map(s => s.close().catch(() => {})))
    })

    it('delivers a DEALER routingId as the first raw frame to the ROUTER', async () => {
        const addr = `tcp://127.0.0.1:${nextPort()}`

        const router = new RouterSocket()
        await router.bind(addr)
        open.push(router)

        const dealer = new DealerSocket({routingId: 'provider-a\u0000serial-1'})
        dealer.connect(addr)
        open.push(dealer)

        const received = nextFrames(router)
        await dealer.send([Buffer.from('D'), Buffer.from('hello')])

        const frames = await received
        expect(frames[0].toString()).toBe('provider-a\u0000serial-1')
        expect(frames[1].toString()).toBe('D')
        expect(frames[2].toString()).toBe('hello')
    })

    it('does not emit reconnect for the very first connection', async () => {
        const addr = `tcp://127.0.0.1:${nextPort()}`

        const router = new RouterSocket()
        await router.bind(addr)
        open.push(router)

        const dealer = new DealerSocket({routingId: 'processor-1', probeRouter: true})
        let reconnects = 0
        dealer.watchReconnect().on('reconnect', () => reconnects++)
        dealer.connect(addr)
        open.push(dealer)

        // Round-trip a message so we know the link is genuinely established.
        await nextFrames(router)

        expect(reconnects).toBe(0)
    })

    it('emits reconnect once when the peer ROUTER restarts', async () => {
        // The state a processor pushes to a proxy (ANNOUNCE/HELLO) is lost when the
        // proxy restarts, because the new process has an empty routing table. ZMQ
        // reconnects transparently and does NOT replay application frames, so this
        // event is the only hook for replaying them.
        const addr = `tcp://127.0.0.1:${nextPort()}`

        const first = new RouterSocket()
        await first.bind(addr)

        const dealer = new DealerSocket({routingId: 'processor-1', probeRouter: true})
        const reconnected: Promise<void> = new Promise((resolve) =>
            dealer.watchReconnect().once('reconnect', () => resolve()))
        dealer.connect(addr)
        open.push(dealer)

        await nextFrames(first) // established
        await first.close()

        // A fresh ROUTER takes over the same endpoint.
        const second = new RouterSocket()
        await second.bind(addr)
        open.push(second)

        await reconnected

        // And the replay actually lands on the NEW router.
        const replayed = nextFrames(second)
        await dealer.send([Buffer.from('A'), Buffer.from('provider-a')])
        expect((await replayed).map(f => f.toString()))
            .toEqual(['processor-1', 'A', 'provider-a'])
    })

    it('stops emitting reconnect after the socket is closed', async () => {
        const addr = `tcp://127.0.0.1:${nextPort()}`

        const router = new RouterSocket()
        await router.bind(addr)

        const dealer = new DealerSocket({routingId: 'processor-1', probeRouter: true})
        let reconnects = 0
        dealer.watchReconnect().on('reconnect', () => reconnects++)
        dealer.connect(addr)

        await nextFrames(router)
        await dealer.close()
        await router.close()

        // Rebinding must not resurrect events on a closed socket.
        const revived = new RouterSocket()
        await revived.bind(addr)
        open.push(revived)
        await new Promise(r => setTimeout(r, 300))

        expect(reconnects).toBe(0)
    })

    it('routes a raw send from the ROUTER back to the addressed DEALER', async () => {
        const addr = `tcp://127.0.0.1:${nextPort()}`

        const router = new RouterSocket()
        await router.bind(addr)
        open.push(router)

        const dealer = new DealerSocket({routingId: 'dev-1'})
        dealer.connect(addr)
        open.push(dealer)

        // Let the ROUTER learn the peer identity via a first message.
        const first = nextFrames(router)
        await dealer.send([Buffer.from('ping')])
        const identity = (await first)[0]

        const reply = nextFrames(dealer)
        await router.send([identity, Buffer.from('pong')])

        const got = await reply
        // The DEALER does not carry an identity frame; it sees only the body.
        expect(got[0].toString()).toBe('pong')
    })

    it('serialises concurrent sends without loss or error', async () => {
        // Reproduces "Socket is busy writing" from production: logcat fires
        // transport.send() for every entry without awaiting. zeromq v6 rejects
        // the 2nd concurrent call at the native layer.
        //
        // We wrap the native socket in a Proxy that adds a 2ms delay to each
        // send, making concurrent in-flight calls detectable. Without the
        // tail-chain fix: violations > 0. With it: violations === 0.
        const addr = `tcp://127.0.0.1:${nextPort()}`

        const router = new RouterSocket()
        await router.bind(addr)
        open.push(router)

        const dealer = new DealerSocket({routingId: 'dev-busy'})
        dealer.connect(addr)
        open.push(dealer)

        // Replace the internal native socket with a Proxy that slows sends.
        let inflight = 0
        let violations = 0
        const realSocket = (dealer as any).socket
        ;(dealer as any).socket = new Proxy(realSocket, {
            get(target, prop) {
                if (prop !== 'send') return (target as any)[prop]
                return async (frames: any) => {
                    if (inflight > 0) violations++
                    inflight++
                    await new Promise(r => setTimeout(r, 2))
                    inflight--
                    return target.send(frames)
                }
            }
        })

        await Promise.all(
            Array.from({length: 10}, (_, i) => dealer.send([Buffer.from(`msg-${i}`)]))
        )

        expect(violations).toBe(0) // RED without tail-chain: violations > 0
    })

    it('continues sending after a transient send error', async () => {
        // If the native socket rejects once (e.g. EHOSTUNREACH during reconnect)
        // the chain must recover: subsequent sends must still be attempted.
        // Without .catch() on sendTail, a single rejection poisons the whole
        // chain and all future sends are silently dropped forever.
        const addr = `tcp://127.0.0.1:${nextPort()}`

        const router = new RouterSocket()
        await router.bind(addr)
        open.push(router)

        const dealer = new DealerSocket({routingId: 'dev-recover'})
        dealer.connect(addr)
        open.push(dealer)

        let callCount = 0
        const realSocket = (dealer as any).socket
        ;(dealer as any).socket = new Proxy(realSocket, {
            get(target, prop) {
                if (prop !== 'send') return (target as any)[prop]
                return async (frames: any) => {
                    callCount++
                    // Simulate one transient error on the 2nd send.
                    if (callCount === 2) throw new Error('EHOSTUNREACH')
                    return target.send(frames)
                }
            }
        })

        const results = await Promise.allSettled([
            dealer.send([Buffer.from('msg-1')]),
            dealer.send([Buffer.from('msg-2')]), // this one errors
            dealer.send([Buffer.from('msg-3')]), // must still be attempted
        ])

        // msg-3 must reach the router — chain must recover after error.
        await new Promise(r => setTimeout(r, 50))
        expect(callCount).toBe(3) // RED without .catch(): callCount === 2
    })
})
