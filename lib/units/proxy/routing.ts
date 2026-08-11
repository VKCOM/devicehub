//
// Pure routing logic for the proxy (no ZMQ I/O — testable in isolation).
//
// The proxy is a ROUTER (bind). Its ROUTER prepends the sender routing id as
// frame 0 on every inbound multipart. So an inbound message is:
//
//   [ senderId, kind, ...rest, body ]
//
// where kind (frame 1) drives the decision:
//   D  device-directed  -> forward to the processor owning the providerName,
//                          pushing the sender onto the reply-path;
//   R  reply            -> pop the top reply-path id and send there;
//   B  broadcast-to-app -> fan out to registered broadcast receivers.
//
// The proxy never decodes the Envelope body.
//
import {KIND, pushReplyPath, popReplyPath, classifyFrames, encodeInit} from '../../wire/frame.js'

export interface Send {
    target: Buffer
    frames: Buffer[]
}

export class ProxyRouting {
    // providerName -> processor routing id
    private providers = new Map<string, Buffer>()

    // Explicitly-registered broadcast receivers (websocket, log), keyed by hex
    // of the routing id so lookups/removals are by value, not reference.
    private broadcastReceivers = new Map<string, Buffer>()

    // Whether the one-shot startup INIT has been handed out. Latched on the
    // FIRST inbound HELLO and never reset, so exactly one processor per proxy
    // lifetime is elected to run the presence reconciliation sweep.
    private initSent = false

    // `startedAt` is this proxy's start time, sent verbatim in the INIT. It is
    // taken at construction (i.e. at proxy unit startup) so the unit itself has
    // nothing extra to wire up; tests can pin it explicitly.
    constructor(private startedAt: number = Date.now()) {}

    // A processor announces which providerName it owns.
    announceProvider(providerName: string, processorId: Buffer) {
        this.providers.set(providerName, processorId)
    }

    // Forget every provider owned by a processor (e.g. it disconnected).
    forgetProcessor(processorId: Buffer) {
        for (const [name, id] of this.providers) {
            if (id.equals(processorId)) {
                this.providers.delete(name)
            }
        }
    }

    registerBroadcastReceiver(routingId: Buffer) {
        this.broadcastReceivers.set(routingId.toString('hex'), routingId)
    }

    unregisterBroadcastReceiver(routingId: Buffer) {
        this.broadcastReceivers.delete(routingId.toString('hex'))
    }

    // Decide the outbound sends for one inbound multipart. Frame 0 is the
    // sender routing id (added by the ROUTER).
    route(inbound: Buffer[]): Send[] {
        // The proxy is a ROUTER: frame 0 is the sender identity.
        const {sender, kind, message} = classifyFrames(inbound, {routerPrepended: true})
        const senderId = sender!

        switch (kind) {
            case KIND.DEVICE:
                return this.routeDevice(senderId, message)
            case KIND.REPLY:
                return this.routeReply(message)
            case KIND.BROADCAST:
                return this.routeBroadcast(message)
            case KIND.ANNOUNCE:
                // [A, providerName] — the sender owns this provider.
                this.announceProvider(message[1].toString(), senderId)
                return []
            case KIND.SUBSCRIBE_BROADCAST:
                // [S] — the sender wants broadcast-to-app events.
                this.registerBroadcastReceiver(senderId)
                return []
            case KIND.HELLO:
                // [H] — a processor has connected. The first one to say hello
                // gets the startup INIT; everyone after it gets nothing. HELLO
                // is sent once per processor, so this is not a hot path.
                return this.routeHello(senderId)
            default:
                return []
        }
    }

    // Elect the first processor to connect and hand it the startup INIT. The
    // INIT carries our start timestamp; the processor decides from it whether it
    // outlived us and therefore owes a presence reconciliation sweep.
    private routeHello(senderId: Buffer): Send[] {
        if (this.initSent) {
            return []
        }
        this.initSent = true
        return [{target: senderId, frames: encodeInit(this.startedAt)}]
    }

    private routeBroadcast(message: Buffer[]): Send[] {
        return [...this.broadcastReceivers.values()].map(target => ({
            target,
            frames: message,
        }))
    }

    private routeReply(message: Buffer[]): Send[] {
        // message = [R, ...replyPath, body]; pop the top id and send there.
        const popped = popReplyPath(message)
        if (!popped.routingId) {
            // No reply-path left: nowhere for the proxy to forward. Drop.
            return []
        }
        return [{target: popped.routingId, frames: popped.frames}]
    }

    private routeDevice(senderId: Buffer, message: Buffer[]): Send[] {
        // message = [D, providerName, serial, ...replyPath, body]
        const providerName = message[1].toString()
        const processorId = this.providers.get(providerName)
        if (!processorId) {
            return []
        }
        return [{
            target: processorId,
            frames: pushReplyPath(message, senderId),
        }]
    }
}
