/**
 * The data path of one open stream: the user's end is a stream id on the
 * `adb connect` socket, the device's end is a real socket (the provider adb
 * server's transport for a forward stream, an adb stream to the reverse helper
 * for a reverse one). DeviceService (service.ts) and ReverseStream
 * (reverse/stream.ts) differ in how a stream opens and closes; once it is open,
 * both move bytes through a StreamFlow.
 *
 * Flow control follows AOSP's local socket (sockets.cpp) in both of its modes:
 *
 *   plain         one A_WRTE in flight per direction. The sender stops reading
 *                 its source until the A_OKAY lands ("acks not deferred,
 *                 blocking", sockets.cpp:231-236); the receiver acknowledges
 *                 as soon as less than one packet is left queued
 *                 (sockets.cpp:150-156).
 *   delayed ack   negotiated per connection ("delayed_ack" in both banners,
 *                 transport.cpp:1270). Each side may have as many bytes in
 *                 flight as the other granted: the opener's A_OPEN arg1 and the
 *                 open's A_OKAY payload set the initial grant (adb.cpp:539-544,
 *                 sockets.cpp:574), every later A_OKAY carries an int32 count of
 *                 bytes the receiver has written out (sockets.cpp:148-150), and
 *                 the sender adds it back (sockets.cpp:418-440). The sender may
 *                 overshoot by one packet: it reads a full one whenever the
 *                 grant is positive (sockets.cpp:213-234).
 *
 * Without delayed ack a stream moves at most one packet per round trip to the
 * user, so over a WAN link its rate is bounded by maxPayload / RTT; the user's
 * adb turns delayed ack on with ADB_BURST_MODE=1 (transport.cpp:1190).
 */

import {A_OKAY, A_WRTE} from './packet.ts'
import type {Packet} from './packet.ts'

/**
 * How many bytes of a stream we let the user have in flight towards the device
 * under delayed ack: our A_OKAY grant, and what bounds a push at
 * RECEIVE_WINDOW / RTT. AOSP grants INITIAL_DELAYED_ACK_BYTES, 32 MiB (adb.h:38);
 * every byte of it may end up queued in this process while the device is
 * slower than the user's link, so we grant half. Measured over a 50 ms round
 * trip to the emulator: 8 MiB 157 MB/s, 16 MiB 300 MB/s, 32 MiB 419 MB/s.
 */
export const RECEIVE_WINDOW = 16 * 1024 * 1024

/** The device end of a stream: adbkit's transport socket, or an adb stream to the reverse helper. */
export interface DeviceSocket {
    read(size?: number): Buffer | null
    /** The callback runs once the chunk has left our buffer for the kernel. */
    write(chunk: Buffer, callback?: (err?: Error | null) => void): boolean
    /** Flush what was written, then call back. */
    end(callback?: () => void): unknown
    destroy(): unknown
    on(event: 'readable' | 'end' | 'close' | 'error', listener: (...args: unknown[]) => void): unknown
}

/** The part of the bridge connection a stream writes to; kept narrow so tests can fake it. */
export interface FlowSocket {
    /** Negotiated in A_CNXN; caps every A_WRTE we send */
    maxPayload: number
    /** True when both sides advertised delayed_ack */
    delayedAck?: boolean
    /** Queue one packet for the client. */
    send(command: number, arg0: number, arg1: number, data?: Buffer): void
    /** True while the client is slow to take what we already queued for it */
    readonly congested?: boolean
    /** Call back once, when the client has caught up. */
    whenDrained?(callback: () => void): void
}

/** An A_OKAY payload under delayed ack: the int32 byte count (adb.cpp:270-279). */
export function ackPayload(bytes: number): Buffer {
    const payload = Buffer.allocUnsafe(4)
    payload.writeInt32LE(bytes)
    return payload
}

export class StreamFlow {
    /** Our id and the user's for this stream, as they go in arg0 and arg1 */
    localId: number
    remoteId: number
    /**
     * Delayed ack: bytes we may still send before the user acknowledges more
     * (available_send_bytes, socket.h:126-129). May go negative by one packet.
     */
    private budget = 0
    /** Plain mode: an A_WRTE of ours is unacknowledged */
    private waiting = false
    /** Bytes handed to the device socket that have not left our buffer yet */
    private unflushed = 0
    /** Plain mode: the user's last write still needs our A_OKAY */
    private owed = 0
    private stopped = false
    private parked = false

    constructor(
        private socket: FlowSocket,
        private device: DeviceSocket,
        localId: number,
        remoteId: number,
        /** Called when the user sends more than the window we granted */
        private onOverrun: () => void
    ) {
        this.localId = localId
        this.remoteId = remoteId
    }

    get delayed(): boolean {
        return !!this.socket.delayedAck
    }

    /**
     * The open is acknowledged and both ids are known. `grant` is the user's
     * initial send window under delayed ack: their A_OPEN arg1 for a stream
     * they opened, their A_OKAY payload for one we opened.
     */
    start(grant = 0): void {
        this.budget = grant
        this.waiting = false
        this.pump()
    }

    /** No packet may go out for this stream from now on. */
    stop(): void {
        this.stopped = true
    }

    /**
     * The user's A_OKAY for an A_WRTE of ours. A payload that does not match
     * the mode is ignored, as AOSP ignores it (adb.cpp:568-571, sockets.cpp:423-427).
     */
    acknowledged(packet: Packet): void {
        const length = packet.data ? packet.data.length : 0
        if (this.delayed) {
            if (length !== 4) {
                return
            }
            this.budget += packet.data!.readInt32LE(0)
        }
        else {
            if (length !== 0) {
                return
            }
            this.waiting = false
        }
        this.pump()
    }

    /** One A_WRTE from the user: its bytes go to the device. */
    write(data: Buffer): void {
        const length = data.length
        if (!length) {
            // Nothing to wait for; a sender never makes one, but it is owed an answer
            this.ack(this.delayed ? 0 : undefined)
            return
        }
        this.unflushed += length
        if (this.delayed && this.unflushed > RECEIVE_WINDOW + this.socket.maxPayload) {
            // More than we ever granted: not an adb that honours the protocol,
            // and holding on would let it fill our memory
            this.onOverrun()
            return
        }
        this.device.write(data, () => {
            this.unflushed -= length
            if (this.delayed) {
                // What a device acknowledges is what it wrote out (sockets.cpp:148-150)
                this.ack(length)
            }
            else {
                this.settle()
            }
        })
        if (!this.delayed) {
            this.owed = length
            this.settle()
        }
    }

    /**
     * Plain mode: the user may send the next write once what is left queued
     * here is less than a packet (sockets.cpp:153-156), i.e. once everything
     * before this write is out. Waiting for this write as well would add the
     * time it takes the device to swallow a whole packet to every round trip.
     */
    private settle(): void {
        if (this.owed && this.unflushed <= this.owed) {
            this.owed = 0
            this.ack()
        }
    }

    private ack(bytes?: number): void {
        if (!this.stopped) {
            this.socket.send(A_OKAY, this.localId, this.remoteId, bytes === undefined ? undefined : ackPayload(bytes))
        }
    }

    /**
     * Send what the device has, as far as the user lets us: one packet in plain
     * mode, up to the grant under delayed ack. Anything left stays in the device
     * socket's buffer and then in the kernel, which holds the device back.
     *
     * Small writes of the device side are merged for free: read() hands back
     * whatever has accumulated, up to one packet, so a thousand 100-byte writes
     * do not cost a thousand round trips. A chunk that fits goes out uncopied.
     */
    pump(): void {
        while (!this.stopped) {
            if (this.delayed ? this.budget <= 0 : this.waiting) {
                return
            }
            // The client's socket is behind: every stream on it waits, rather
            // than each piling up to its whole window in our memory
            if (this.socket.congested) {
                if (!this.parked) {
                    this.parked = true
                    this.socket.whenDrained!(() => {
                        this.parked = false
                        this.pump()
                    })
                }
                return
            }
            // read(n) yields nothing until n bytes are buffered, so fall back to
            // whatever is there, which is then less than maxPayload. Asking for n
            // also raises the socket's high water mark to n, so reads keep up
            // with the largest packet the client accepts.
            const chunk = this.device.read(this.socket.maxPayload) || this.device.read()
            if (!chunk) {
                return
            }
            this.socket.send(A_WRTE, this.localId, this.remoteId, chunk)
            if (this.delayed) {
                this.budget -= chunk.length
            }
            else {
                this.waiting = true
            }
        }
    }
}
