/**
 * One stream the user opened on the device through the `adb connect` socket.
 *
 * Our replacement for adbkit's tcpusb `Service` (dist/adb/tcpusb/service.js),
 * which loses the outcome of a failed open: `handle()` calls `_handleOpenPacket`
 * without awaiting it, so when the provider's adb server answers FAIL — `tcp:8500`
 * with nothing listening on the device, a service adbd does not know — the
 * rejection escapes as an unhandledRejection. Without Sentry's handler (no
 * SENTRY_DSN) Node exits on it and the whole device worker goes down; with it the
 * stream is never answered at all: no A_OKAY, no A_CLSE, the entry stays in the
 * ServiceMap, and the user's client blocks on a socket that will never see EOF.
 * Kaspresso's adb-server hits exactly this: it forwards tcp:8500 and keeps
 * connecting until the test on the device starts listening there.
 *
 * A device answers a failed open with A_CLSE(0, their id) (adb.cpp:597), which is
 * what tells the user's server to close its local socket, so that is what we send.
 */

import {serviceName, A_OKAY, A_WRTE, A_CLSE, type Packet} from './packet.ts'
import {ackPayload, RECEIVE_WINDOW, StreamFlow, type DeviceSocket, type FlowSocket} from './flow.ts'

/** The provider-side stream of one opened service: adbkit's transport socket, a net.Socket. */
export type ServiceTransport = DeviceSocket

/**
 * Open `name` on the device through the provider's adb server. Resolves once the
 * server has answered OKAY, rejects on FAIL or when the device is unreachable.
 * Injected so this module needs no adb.
 */
export type OpenService = (name: string) => Promise<ServiceTransport>

/** The part of the bridge connection a service needs; kept narrow so tests can fake it. */
export type ServiceSocket = FlowSocket

/**
 * The rest of the connection that opens streams on it: the id counter and the
 * service map. Both must be the connection's own — ids are shared by every
 * stream on it, and the connection routes incoming packets through that map.
 */
export interface ServiceHost extends ServiceSocket {
    remoteId: {next(): number}
    services: {
        insert(localId: number, handler: {handle(packet: Packet): void, end(): void}): unknown
        remove(localId: number): unknown
    }
}

/**
 * Close a provider connection for good: what was written is flushed first, but
 * nothing more is read. Ending alone is not enough — a socket with unread data
 * never reaches 'end', so it would hold its fd for as long as the process runs.
 */
export function release(transport: ServiceTransport): void {
    transport.end(() => transport.destroy())
}

export class DeviceService {
    private transport?: ServiceTransport
    private flow?: StreamFlow
    /** True once the open was acknowledged, which changes how we close. */
    private opened = false
    /** True once this stream is torn down; nothing more may go on the wire. */
    private ended = false

    constructor(
        private socket: ServiceSocket,
        private localId: number,
        private remoteId: number,
        private openService: OpenService,
        /** Called once, synchronously, after this stream finishes tearing down. */
        private onEnd?: () => void,
        /** Under delayed ack, the user's A_OPEN arg1: how much we may send them */
        private grant = 0
    ) {}

    /**
     * Serve the user's A_OPEN for `name`. Never rejects: every way an open can
     * fail ends in an A_CLSE, so the user's client always learns the outcome.
     */
    async open(name: string): Promise<void> {
        let transport: ServiceTransport
        try {
            transport = await this.openService(name)
        }
        catch {
            this.end()
            return
        }

        // The bridge closed while the provider was still answering. adbkit throws
        // LateTransportError here and leaks the transport; we close it.
        if (this.ended) {
            transport.destroy()
            return
        }

        this.transport = transport
        const flow = new StreamFlow(this.socket, transport, this.localId, this.remoteId, () => this.end())
        this.flow = flow
        // Under delayed ack the open's A_OKAY carries what the user may send us
        // (adb.cpp:539-544)
        this.socket.send(A_OKAY, this.localId, this.remoteId,
            this.socket.delayedAck ? ackPayload(RECEIVE_WINDOW) : undefined)
        this.opened = true

        transport.on('readable', () => flow.pump())
        transport.on('end', () => this.end())
        // A reset connection may emit 'close' without 'end'
        transport.on('close', () => this.end())
        // Never removed: adbkit re-emits a socket error with no listener of
        // ours on the shared adb client, which nobody listens to — a crash
        transport.on('error', () => this.end())
        flow.start(this.grant)
    }

    /** A packet from the user for this stream, routed here by the connection's service map. */
    handle(packet: Packet): void {
        if (this.ended) {
            return
        }

        if (packet.command === A_OKAY) {
            this.flow?.acknowledged(packet)
            return
        }

        if (packet.command === A_CLSE) {
            this.end()
            return
        }

        // The user only learns our id from our A_OKAY, so a write cannot arrive
        // before the transport is there; ignore one that claims otherwise.
        if (packet.command === A_WRTE && this.flow) {
            // Our A_OKAY is the client's permission to send more, so it waits
            // while the provider is behind: memory stays bounded per stream
            // however fast the client pushes (`adb push` over LAN to a device on
            // slow USB). See StreamFlow for when exactly it goes.
            this.flow.write(packet.data ?? Buffer.alloc(0))
        }
    }

    /**
     * Tear the stream down from our side. A zero arg0 is the protocol's
     * failed-open form (adb.cpp:597): before our A_OKAY there is no stream of
     * ours for the user to charge the close to.
     */
    end(): void {
        if (this.ended) {
            return
        }
        this.ended = true
        this.flow?.stop()
        if (this.transport) {
            release(this.transport)
        }
        this.socket.send(A_CLSE, this.opened ? this.localId : 0, this.remoteId)
        this.onEnd?.()
    }
}

/** 4 lowercase hex length chars followed by the payload (SendProtocolString). */
export function protocolString(s: string): Buffer {
    const payload = Buffer.from(s, 'utf8')
    const length = payload.length.toString(16).padStart(4, '0')
    return Buffer.concat([Buffer.from(length, 'ascii'), payload])
}

/**
 * Serve any A_OPEN that is not a `reverse:` request with a DeviceService.
 *
 * The stream goes into the connection's own service map under an id from its
 * own counter, so the connection routes the user's A_OKAY/A_WRTE/A_CLSE to it
 * by arg1 and ends it along with itself.
 */
export function serveOpen(socket: ServiceHost, packet: Packet, openService: OpenService): void {
    const name = packet.data ? serviceName(packet.data) : ''
    const localId = socket.remoteId.next()
    const service = new DeviceService(socket, localId, packet.arg0, openService,
        () => socket.services.remove(localId), packet.arg1)
    socket.services.insert(localId, service)
    // adbd has no service with an empty name and refuses the open
    if (!name) {
        service.end()
        return
    }
    void service.open(name)
}
