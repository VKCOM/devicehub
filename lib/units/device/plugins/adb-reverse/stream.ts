/**
 * One reverse connection, tunnelled to the user inside the `adb connect` socket.
 *
 * This is the mirror image of adbkit's tcpusb `Service` (dist/adb/tcpusb/service.js):
 * there the user opens a stream on us, here we open a stream on the user. So the
 * ids run the other way round — we allocate our own id up front and only learn
 * the user's id from their first A_OKAY.
 */

import {assemble, A_OPEN, A_OKAY, A_WRTE, A_CLSE} from './packet.ts'

/** The part of adbkit's tcpusb Socket we need; kept narrow so tests can fake it. */
export interface ReverseSocket {
    maxPayload: number
    write(chunk: Buffer): boolean
}

/** An inbound packet, as adbkit's PacketReader hands it to us. */
export interface ReversePacket {
    command: number
    arg0: number
    arg1: number
    data?: Buffer
}

/**
 * The device end of this reverse connection: one multiplexed minirev stream.
 * Narrow on purpose — the framing lives in the forward plugin's writer, so all
 * this stream needs is somewhere to put the user's bytes.
 */
export interface ReverseDevice {
    write(chunk: Buffer): void
    /** Hang up the minirev stream; the app on the device sees its socket close. */
    end(): void
}

export class ReverseStream {
    /** The user's id for this stream. Unknown until their first A_OKAY. */
    private remoteId = 0
    /** True once the user has accepted the open, which changes how we close. */
    private opened = false
    /** True while an A_WRTE of ours is unacknowledged; blocks the next one. */
    private needAck = true
    /** Device bytes waiting for the write window to open. */
    private pending: Buffer[] = []
    /** True once this stream is torn down; nothing more may go on the wire. */
    private ended = false
    /**
     * True when the device side has closed but we still have bytes in flight or
     * pending.  Mirrors AOSP's local_socket_closing_list: the stream is not
     * destroyed until the last packet drains (sockets.cpp:161, 361-378).
     */
    private deviceEnded = false

    constructor(
        private socket: ReverseSocket,
        private localId: number,
        private spec: string,
        private device: ReverseDevice,
        /** Called once, synchronously, after this stream finishes tearing down. */
        private onEnd?: () => void
    ) {}

    /**
     * Ask the user's adb server to connect to `spec` on their machine.
     *
     * arg1 is 0 because we do not know their stream id yet; a non-zero value
     * there would be read as a delayed-ack window that was never negotiated.
     * The service name is null-terminated, as adbd sends it.
     */
    open(): void {
        this.socket.write(assemble(A_OPEN, this.localId, 0, Buffer.from(`${this.spec}\0`)))
    }

    /**
     * A packet arriving from the user for this stream.
     *
     * Their first A_OKAY is what tells us the id they gave this stream; we must
     * echo it as arg1 on everything we send afterwards, or their server has no
     * socket to route it to.
     */
    handle(packet: ReversePacket): void {
        // Packets in flight when we closed still arrive. Our localId is dead by
        // now and may already name a different stream on their side, so nothing
        // more may go out under it; the device connection is gone regardless.
        if (this.ended) {
            return
        }

        if (packet.command === A_OKAY) {
            this.remoteId = packet.arg0
            this.opened = true
            // Both the open acknowledgement and every later write acknowledgement
            // arrive as a bare A_OKAY, so the same packet clears the write window.
            this.needAck = false
            this.tryPush()
            return
        }

        if (packet.command === A_CLSE) {
            // Their end is gone, so the app on the device must not be left
            // holding an open socket that will never answer. The close is
            // echoed as well: AOSP runs local_socket_close -> peer->shutdown
            // (sockets.cpp:352), which is remote_socket_shutdown and writes an
            // A_CLSE back (sockets.cpp:552). It cannot loop, because by then
            // their socket is gone and find_local_socket drops the packet.
            this.end()
            return
        }

        if (packet.command === A_WRTE) {
            if (packet.data) {
                this.device.write(packet.data)
            }
            // Acknowledge unconditionally and with no payload. The user's server
            // stops reading its socket until this lands (sockets.cpp:232), and a
            // payload here would either be misread as a delayed-ack credit or
            // rejected outright (adb.cpp:568).
            this.socket.write(assemble(A_OKAY, this.localId, this.remoteId))
        }
    }

    /**
     * The app on the device closed its socket — minirev signals this as a
     * zero-length frame, which MinirevReader turns into ('packet', connId, null).
     *
     * If the send window is already clear and the pending queue is empty we can
     * close immediately (mirrors AOSP: packet_queue empty → destroy right away,
     * sockets.cpp:364). Otherwise we mark deviceEnded and let tryPush drain the
     * queue first; it calls end() after the last chunk goes out, exactly as
     * local_socket_flush_incoming does when it sees (closing && !fd_full)
     * (sockets.cpp:160-163).
     */
    fromDeviceEnd(): void {
        this.deviceEnded = true
        this.tryPush()
    }

    /** Bytes read from the device, on their way to the user. */
    fromDevice(chunk: Buffer): void {
        this.pending.push(chunk)
        this.tryPush()
    }

    /**
     * Tear down this reverse connection from our side.
     *
     * The peer id goes in arg1 because the user's server looks the socket up by
     * it and ignores the packet outright when it is zero (adb.cpp:594). A zero
     * arg0 is the protocol's failed-OPEN form (adb.cpp:597): before their A_OKAY
     * there is no stream of ours for them to charge the close to.
     */
    end(): void {
        if (this.ended) {
            return
        }
        this.ended = true
        // Device side first, mirroring adbkit's Service.end (transport.end before
        // the A_CLSE): the app must not keep a socket nobody is serving. Unlike
        // adbkit we tear down inside the guard — its transport is attached late
        // and may need ending on a stream that never opened, whereas ours is a
        // constructor argument, so one close per stream is all that is correct.
        this.device.end()
        this.socket.write(assemble(A_CLSE, this.opened ? this.localId : 0, this.remoteId))
        this.onEnd?.()
    }

    /**
     * Send at most one A_WRTE.
     *
     * With delayed ack unnegotiated, exactly one write may be in flight: AOSP's
     * sender stops reading its own socket until the ack lands (sockets.cpp:232,
     * "acks not deferred, blocking"). So anything the device produces meanwhile
     * has to wait here rather than go out as a second unacked packet.
     *
     * If the device side has already closed (deviceEnded) and the queue is now
     * empty after this write, we close immediately — mirroring AOSP's
     * local_socket_flush_incoming: `if (s->closing && !fd_full) s->close(s)`
     * (sockets.cpp:160-163). The write itself happens before end() so the bytes
     * arrive before the A_CLSE on the same TCP stream.
     */
    private tryPush(): void {
        if (this.ended) {
            return
        }
        if (!this.needAck && this.pending.length) {
            this.socket.write(assemble(A_WRTE, this.localId, this.remoteId, this.takeChunk()))
            this.needAck = true
        }
        // Deferred close: the device hung up while bytes were still queued or in
        // flight. This check must sit outside the write above, because the queue
        // can be empty while an A_WRTE is still unacknowledged — then there is
        // nothing left to send and nothing left to wait for.
        if (this.deviceEnded && !this.pending.length) {
            this.end()
        }
    }

    /**
     * Next queued bytes, capped at the peer's payload limit.
     *
     * Chunks are forwarded as they came off the device instead of being merged,
     * so the common case copies nothing; only an oversized chunk gets split.
     */
    private takeChunk(): Buffer {
        const head = this.pending[0]
        if (head.length <= this.socket.maxPayload) {
            this.pending.shift()
            return head
        }
        this.pending[0] = head.subarray(this.socket.maxPayload)
        return head.subarray(0, this.socket.maxPayload)
    }
}
