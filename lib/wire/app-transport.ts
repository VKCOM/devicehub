//
// The app-side transport for the ROUTER/DEALER protocol.
//
// Every app-side unit (api, websocket, log, groups-engine) connects to the
// proxy over a SINGLE DEALER and does two things:
//
//   - sends device-directed commands as [D, providerName, serial, envelope];
//     the proxy pushes this DEALER's routingId onto the reply-path and forwards
//     to the processor owning that provider. A reply travels back and the proxy
//     pops us off the reply-path, so we receive it as [R, envelope];
//   - optionally registers as a broadcast receiver by sending a single [S]
//     frame, after which the proxy fans every broadcast out to us as
//     [B, selector, envelope].
//
// Two layers:
//   - AppWire: pure framing/classification logic (no ZMQ) — testable in
//     isolation.
//   - AppTransport: ZMQ glue over a DealerSocket, exposing events:
//       'message'   (channel, body) — a reply (R), matched by TransactionManager;
//       'broadcast' (body)          — a broadcast-to-app event (B), fed into WireRouter.
//
import {EventEmitter} from 'events'
import logger from '../util/logger.js'
import type {DealerSocket} from '../util/zmqsocket.js'
import {KIND, encodeDeviceFrame, encodeBroadcast, classifyFrames, BROADCAST_ALL, Frames} from './frame.js'
import {Envelope} from './wire.js'

const log = logger.createLogger('wire:app-transport')

export interface InboundReply {
    kind: typeof KIND.REPLY | typeof KIND.BROADCAST
    // The correlationId (Envelope.channel) — only meaningful for a reply, used
    // to match a pending transaction. Empty for a broadcast.
    channel: string
    // The Envelope body frame (the last frame), decoded by the consumer's
    // WireRouter / TransactionManager.
    body: Buffer
}

export class AppWire {
    // Encode a device-directed command. The reply-path starts empty; the proxy
    // pushes this DEALER's routingId as it forwards up.
    encodeCommand(providerName: string, serial: string, envelope: Buffer): Frames {
        return encodeDeviceFrame(providerName, serial, envelope)
    }

    // Encode the one-shot broadcast-receiver registration frame [S].
    encodeSubscribe(): Frames {
        return [Buffer.from(KIND.SUBSCRIBE_BROADCAST)]
    }

    // Encode an app-originated broadcast-to-app event as [B, selector, envelope].
    // The proxy fans it out to every registered broadcast receiver. The default
    // selector (BROADCAST_ALL) targets all of them; receivers filter client-side.
    encodeBroadcast(envelope: Buffer, selector: string = BROADCAST_ALL): Frames {
        return encodeBroadcast(envelope, selector)
    }

    // Classify one inbound multipart. The DEALER strips the identity frame and
    // the proxy pops the routingId off the reply-path before delivery, so:
    //   [R, envelope]           -> reply for a pending transaction;
    //   [B, selector, envelope] -> broadcast-to-app event.
    // Empty probe/keepalive frames and unexpected kinds return null.
    classifyInbound(frames: Frames): InboundReply | null {
        if (!frames.length || (frames.length === 1 && frames[0].length === 0)) {
            return null
        }
        const {kind} = classifyFrames(frames, {routerPrepended: false})
        const body = frames[frames.length - 1]

        if (kind === KIND.REPLY) {
            const channel = Envelope.fromBinary(body).channel ?? ''
            return {kind: KIND.REPLY, channel, body}
        }
        if (kind === KIND.BROADCAST) {
            return {kind: KIND.BROADCAST, channel: '', body}
        }
        return null
    }
}

// The app-facing transport over a DEALER connected to the proxy.
//
// Events:
//   'message'  (channel: string, body: Buffer) — reply (R); channel is
//              Envelope.channel (correlationId) for TransactionManager matching.
//   'broadcast'(body: Buffer)                  — broadcast-to-app event (B).
export class AppTransport extends EventEmitter {
    private wire = new AppWire()
    private subscribed = false

    constructor(private dealer: DealerSocket) {
        super()
        this.dealer.on('frames', (frames: Buffer[]) => {
            try {
                this.onFrames(frames)
            }
            catch (err: any) {
                log.error('Inbound framing error: %s', err?.message || err)
            }
        })
    }

    private onFrames(frames: Buffer[]) {
        const inbound = this.wire.classifyInbound(frames)
        if (!inbound) {
            return
        }
        if (inbound.kind === KIND.REPLY) {
            this.emit('message', inbound.channel, inbound.body)
        }
        else {
            this.emit('broadcast', inbound.body)
        }
    }

    // Register once as a broadcast receiver. Idempotent.
    registerBroadcast() {
        if (this.subscribed) {
            return
        }
        this.subscribed = true
        this.dealer.send(this.wire.encodeSubscribe()).catch((err: any) =>
            log.warn('Broadcast registration failed: %s', err?.message))
    }

    // Send a device-directed command. `envelope` is a packed Envelope buffer
    // (from wireutil.pack/tr); providerName+serial address the device.
    sendCommand(providerName: string, serial: string, envelope: Uint8Array) {
        const body = Buffer.isBuffer(envelope) ? envelope : Buffer.from(envelope)
        this.dealer.send(this.wire.encodeCommand(providerName, serial, body))
            .catch((err: any) => log.warn('Command to %s/%s undeliverable: %s',
                providerName, serial, err?.message))
    }

    // Publish a broadcast-to-app event. The proxy fans it out to every registered
    // broadcast receiver; receivers filter client-side. `selector` defaults to
    // all receivers.
    sendBroadcast(envelope: Uint8Array, selector?: string) {
        const body = Buffer.isBuffer(envelope) ? envelope : Buffer.from(envelope)
        this.dealer.send(this.wire.encodeBroadcast(body, selector))
            .catch((err: any) => log.warn('Broadcast undeliverable: %s', err?.message))
    }

    close() {
        this.removeAllListeners()
        return this.dealer.close()
    }
}
