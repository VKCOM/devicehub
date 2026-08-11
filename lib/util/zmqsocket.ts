//
// Thin ROUTER/DEALER layer over native zeromq v6.
//
// Works with raw multipart Buffer[] as required by the frame protocol
// (lib/wire/frame.ts):
//   - a ROUTER prepends the sender routing id as frame 0 on receive, and takes
//     the target routing id as frame 0 on send;
//   - a DEALER receives body frames as-is and its identity is set once via
//     ZMQ_ROUTING_ID.
//
import {Router, Dealer, Context} from 'zeromq'
import {EventEmitter} from 'events'
import logger from './logger.js'

const log = logger.createLogger('util:zmqsocket')

// Shared ZMQ context so we don't spin up multiple io-thread pools.
let sharedContext: Context
const getSharedContext = () => {
    if (!sharedContext) {
        sharedContext = new Context({
            blocky: true,
            ioThreads: 4,
            ipv6: true,
            maxSockets: 8192,
        })
    }
    return sharedContext
}

const KEEPALIVE = Number(process.env.ZMQ_KEEPALIVE_INTERVAL || 30)

const baseSocketOptions = () => ({
    linger: 2000,
    tcpKeepalive: 1,
    tcpKeepaliveIdle: KEEPALIVE,
    tcpKeepaliveInterval: KEEPALIVE,
    tcpKeepaliveCount: 100,
    context: getSharedContext(),
})

abstract class BaseSocket<T extends Router | Dealer> extends EventEmitter {
    protected abstract socket: T
    protected active = true
    private looping = false
    // Tail-chain serialises concurrent send() calls. zeromq v6 rejects any
    // send() while a previous one is in flight ("Socket is busy writing").
    // Each call chains onto the tail; the chain GC's as each link resolves.
    // Zero allocations beyond the promise itself — no array, no queue.
    private sendTail: Promise<void> = Promise.resolve()

    // Drives the async receive loop; emits 'frames' with the raw Buffer[].
    protected startReceiveLoop() {
        if (this.looping) {
            return
        }
        this.looping = true
        ;(async () => {
            try {
                for await (const frames of this.socket as AsyncIterable<Buffer[]>) {
                    if (!this.active) {
                        break
                    }
                    this.emit('frames', frames)
                }
            }
            catch (err: any) {
                if (this.active) {
                    log.error('Receive loop error: %s', err?.message || err)
                }
            }
        })()
    }

    send(frames: Buffer[]): Promise<this> {
        if (!this.active) {
            return Promise.resolve(this)
        }
        // Tail-chain: serialises concurrent sends so the native socket never
        // has two in-flight calls at once (zeromq v6: "Socket is busy writing").
        //
        // The tail reference is updated synchronously, so every concurrent
        // caller queues before any await runs.
        //
        // Critical: we keep the tail always-resolving via .catch(() => {}).
        // Without it, a single rejection (e.g. EHOSTUNREACH during reconnect)
        // would poison sendTail permanently and silently drop all future sends.
        // The caller's returned promise still sees the rejection for this send.
        const next = this.sendTail.then(() => {
            if (!this.active) return
            return (this.socket as any).send(frames)
        })
        this.sendTail = next.catch(() => {}) // swallow error, keep chain alive
        return next.then(() => this)
    }

    // Drain any queued sends before closing. Useful when a 'close' handler
    // enqueues a final message that must be delivered before the socket shuts down.
    flush(): Promise<void> {
        return this.sendTail
    }

    async close() {
        this.active = false
        try {
            this.socket.close()
        }
        catch {
            // ignore
        }
        this.removeAllListeners()
    }
}

export interface RouterOptions {
    // ZMQ_ROUTER_HANDOVER: accept a reconnecting peer that reuses an identity.
    handover?: boolean
    // ZMQ_ROUTER_MANDATORY: fail send() with EHOSTUNREACH for unknown peers
    // instead of silently dropping.
    mandatory?: boolean
}

export class RouterSocket extends BaseSocket<Router> {
    protected socket: Router

    constructor(options: RouterOptions = {}) {
        super()
        this.socket = new Router({
            ...baseSocketOptions(),
        })
        // Default to the resilient/diagnostic settings; callers may override.
        this.socket.handover = options.handover ?? true
        this.socket.mandatory = options.mandatory ?? true
    }

    async bind(address: string) {
        await this.socket.bind(address)
        log.info('ROUTER bound on %s', address)
        this.startReceiveLoop()
        return this
    }
}

export interface DealerOptions {
    // ZMQ_ROUTING_ID: stable identity so a ROUTER recognises this peer
    // deterministically across reconnects.
    routingId?: string
    // ZMQ_PROBE_ROUTER: send an empty message on connect so the ROUTER learns
    // the identity before the first application message.
    probeRouter?: boolean
    // Whether to run the receive loop (an app-side DEALER receives; a pure
    // sender may skip it).
    receive?: boolean
}

export class DealerSocket extends BaseSocket<Dealer> {
    protected socket: Dealer

    constructor(options: DealerOptions = {}) {
        super()
        this.socket = new Dealer({
            ...baseSocketOptions(),
            ...(options.routingId != null && {routingId: options.routingId}),
        })
        if (options.probeRouter != null) {
            this.socket.probeRouter = options.probeRouter
        }
        if (options.receive ?? true) {
            this.startReceiveLoop()
        }
    }

    connect(address: string) {
        this.socket.connect(address)
        log.verbose('DEALER connected to %s', address)
        return this
    }

    // Emit 'reconnect' every time the underlying socket (re)establishes a
    // connection AFTER the first one. ZMQ reconnects transparently, but the peer
    // ROUTER is a fresh process with an empty routing table, so any state we
    // previously pushed to it (ANNOUNCE, HELLO) has to be pushed again. Opt-in,
    // because it starts a second async loop over the socket's event observer.
    watchReconnect() {
        let seenFirst = false
        ;(async () => {
            try {
                for await (const event of this.socket.events) {
                    if (!this.active) {
                        break
                    }
                    if (event.type !== 'connect') {
                        continue
                    }
                    if (!seenFirst) {
                        seenFirst = true
                        continue
                    }
                    this.emit('reconnect')
                }
            }
            catch (err: any) {
                if (this.active) {
                    log.error('Event loop error: %s', err?.message || err)
                }
            }
        })()
        return this
    }
}
