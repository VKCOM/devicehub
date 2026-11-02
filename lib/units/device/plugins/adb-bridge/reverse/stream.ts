/**
 * One reverse connection, tunnelled to the user inside the `adb connect` socket.
 *
 * This is the mirror image of DeviceService (service.ts): there the user opens a
 * stream on us, here we open a stream on the user. So the ids run the other way
 * round — we allocate our own id up front and only learn the user's id from
 * their first A_OKAY. Once open, the data path is the same: the device end is a
 * real socket (an adb stream to the reverse helper on the device, attached to
 * the app's connection, helper.ts), read only while the user's window is open
 * and acknowledged only once it has taken the user's bytes.
 */

import {A_OPEN, A_OKAY, A_WRTE, A_CLSE, type Packet} from '../packet.ts'
import {RECEIVE_WINDOW, StreamFlow} from '../flow.ts'
import {release, type ServiceSocket, type ServiceTransport} from '../service.ts'

/** The part of the bridge connection we need; kept narrow so tests can fake it. */
export type ReverseSocket = ServiceSocket

/**
 * The device end of this reverse connection: the adb stream we opened to the
 * reverse helper and attached to the app's connection on the reversed port.
 * A net.Socket; the same shape as a forward stream's transport.
 */
export type ReverseDevice = ServiceTransport

export class ReverseStream {
    /** True once the user has accepted the open, which changes how we close. */
    private opened = false
    /** True once this stream is torn down; nothing more may go on the wire. */
    private ended = false
    /** True when the device hung up before the user accepted the open. */
    private deviceGone = false
    /** The data path; its remoteId stays 0 until the user's first A_OKAY. */
    private flow: StreamFlow

    constructor(
        private socket: ReverseSocket,
        private localId: number,
        private spec: string,
        private device: ReverseDevice,
        /** Called once, synchronously, after this stream finishes tearing down. */
        private onEnd?: () => void
    ) {
        this.flow = new StreamFlow(socket, device, localId, 0, () => this.end())
    }

    /**
     * Ask the user's adb server to connect to `spec` on their machine.
     *
     * arg1 is 0 without delayed ack: their server refuses an A_OPEN whose arg1
     * does not match the connection's mode (adb.cpp:506-511). With it, arg1 is
     * how much they may send us before our first A_OKAY. The service name is
     * null-terminated, as adbd sends it.
     */
    open(): void {
        // 'readable' alone starts the socket reading into its own buffer, up to
        // its high water mark and no further: whatever the app sends before the
        // user accepts (or while a write is unacknowledged) waits there and then
        // in the kernel, and the app's writes block — the backpressure a device
        // applies too (sockets.cpp:232). No queue of ours, so nothing unbounded.
        //
        // 'end' fires only once everything the app sent has been read, so a
        // device that hangs up mid-transfer still has its last bytes delivered
        // before our A_CLSE: AOSP's local_socket_closing_list behaviour
        // (sockets.cpp:161, 361-378) without any bookkeeping of ours.
        this.device.on('readable', () => {
            if (this.opened) {
                this.flow.pump()
            }
        })
        this.device.on('end', this.hangUp)
        // A reset connection may emit 'close' without 'end'
        this.device.on('close', this.hangUp)
        // Never removed: a socket error with no listener is an uncaught exception
        this.device.on('error', this.hangUp)
        this.socket.send(A_OPEN, this.localId, this.socket.delayedAck ? RECEIVE_WINDOW : 0,
            Buffer.from(`${this.spec}\0`))
    }

    /**
     * A packet arriving from the user for this stream.
     *
     * Their first A_OKAY is what tells us the id they gave this stream; we must
     * echo it as arg1 on everything we send afterwards, or their server has no
     * socket to route it to.
     */
    handle(packet: Packet): void {
        // Packets in flight when we closed still arrive. Our localId is dead by
        // now and may already name a different stream on their side, so nothing
        // more may go out under it; the device connection is gone regardless.
        if (this.ended) {
            return
        }

        if (packet.command === A_OKAY) {
            if (this.opened) {
                this.flow.acknowledged(packet)
                return
            }
            this.opened = true
            this.flow.remoteId = packet.arg0
            if (this.deviceGone) {
                this.end()
                return
            }
            // Under delayed ack the answer to our open carries their initial
            // window (adb.cpp:539-544); a malformed one leaves it at nothing,
            // which stalls the stream as it would stall AOSP's (sockets.cpp:423-427)
            const data = packet.data
            this.flow.start(this.socket.delayedAck && data?.length === 4 ? data.readInt32LE(0) : 0)
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

        // Only an opened stream has anywhere to write to: before their A_OKAY the
        // user cannot address this stream at all.
        if (packet.command === A_WRTE && this.opened) {
            // The user's server stops sending until our A_OKAY lands
            // (sockets.cpp:232), so holding it while the device is behind is what
            // keeps a fast sender from piling its data up in our memory. See
            // StreamFlow for when exactly it goes.
            this.flow.write(packet.data ?? Buffer.alloc(0))
        }
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
        this.flow.stop()
        // Device side first: the app must not keep a socket nobody is serving.
        // What the user already wrote still reaches it — release flushes first.
        release(this.device)
        this.socket.send(A_CLSE, this.opened ? this.localId : 0, this.flow.remoteId)
        this.onEnd?.()
    }

    /**
     * The app on the device closed its socket, or it broke.
     *
     * Before the user has accepted the open we do not know their id, and a close
     * without it is dropped by their server (adb.cpp:594) — their end, already
     * connected to their local service, would stay open for as long as the
     * `adb connect` session does. So the close waits for their answer; the app
     * sent nothing, since we read nothing before that answer.
     */
    private readonly hangUp = (): void => {
        if (this.opened) {
            this.end()
            return
        }
        this.deviceGone = true
    }
}
