/**
 * All reverse connections arriving on one bound reverse forward.
 *
 * One instance per `adb reverse` binding, owning the minirev stream that
 * multiplexes every connection made to that device port. On a new connection
 * `DestHandler` (in the old forward plugin) would call net.connect() from the
 * provider host; here we push an A_OPEN at the user so the connection is made
 * on *their* machine.
 */

import {ReverseStream, type ReverseSocket, type ReverseDevice} from './stream.ts'
import type {ReverseForwards} from './forwards.ts'

/** minirev's frame header: [uint16LE connId][uint16LE length] (writer.js:3). */
const FRAME_HEADER_SIZE = 4

/**
 * The rest of adbkit's tcpusb Socket we need: the id counter and the service
 * map. Both must be the socket's own — ids are shared with the client's streams,
 * and `_forwardServicePacket` routes incoming packets through that same map.
 */
export interface ReverseHostSocket extends ReverseSocket {
    remoteId: {next(): number}
    services: {
        insert(localId: number, handler: {handle(packet: unknown): void, end(): void}): unknown
        remove(localId: number): unknown
    }
}

/** The minirev stream for this binding; framing is applied here, not by callers. */
export interface ReverseConn {
    write(chunk: Buffer): boolean
    end(): void
}

export class ReverseStreamManager {
    private streams = new Map<number, ReverseStream>()
    /** True once the forward is torn down; no further connection may be opened. */
    private ended = false

    constructor(
        private socket: ReverseHostSocket,
        private remote: string,
        private forwards: ReverseForwards,
        private conn: ReverseConn
    ) {}

    /**
     * A minirev frame, as MinirevReader emits it: ('packet', connId, data), with
     * `null` for the zero-length FIN frame.
     */
    handlePacket(connId: number, data: Buffer | null): void {
        // Frames outlive the teardown. conn.end() only half-closes the stream, so
        // whatever minirev had already put on the wire still comes through
        // MinirevReader afterwards. Opening a stream for one of them would ask the
        // user's server to connect for a forward it has already dropped from
        // reverse_forwards_ — LOG(FATAL), their adb dies (adb.cpp:500) — and would
        // register a handler in a ServiceMap nobody drains any more.
        if (this.ended) {
            return
        }

        let stream = this.streams.get(connId)

        if (!stream) {
            // The local spec is resolved per connection, never cached: a
            // killforward between the bind and this connection must stop us from
            // opening a stream the user's server no longer allows — it answers an
            // unrecognised A_OPEN with LOG(FATAL) (adb.cpp:500).
            const local = this.forwards.resolveLocal(this.remote)
            if (!local) {
                return
            }
            const localId = this.socket.remoteId.next()
            stream = new ReverseStream(this.socket, localId, local, this.deviceSink(connId), () => {
                // Slice 6: remove from both maps when the stream closes, from either
                // side. Without this ServiceMap.insert will throw on id reuse when
                // RollingCounter wraps, and this.streams leaks one entry per request.
                this.socket.services.remove(localId)
                this.streams.delete(connId)
            })
            // connId is the connection's identity for its whole life: every later
            // frame of it must find this same stream, not open a second one.
            this.streams.set(connId, stream)
            // Registered before the A_OPEN goes out, not after: adbkit routes
            // every A_OKAY/A_WRTE/A_CLSE by arg1 through this map
            // (socket.js:_forwardServicePacket), so the answer to our open has
            // nowhere to land until the entry exists.
            this.socket.services.insert(localId, stream)
            stream.open()
        }

        if (data) {
            stream.fromDevice(data)
        }
        else {
            stream.fromDeviceEnd()
        }
    }

    /**
     * The forward itself is going away — `adb reverse --remove`, the end of the
     * `adb connect` session, or the device leaving the group.
     *
     * Every connection still open under it has to be closed, in both directions:
     * each stream sends its own A_CLSE to the user and its own FIN frame to the
     * device, so nothing is left holding a socket that will never be served.
     * Our counterpart in adbkit is ServiceMap.end (servicemap.js), which ends
     * every registered handler the same way.
     *
     * Deleting from `this.streams` while iterating it is safe here: each close
     * runs the stream's onEnd, which removes that stream's own entry, and a Map
     * iterator skips entries deleted behind it rather than losing its place.
     * ReverseStream.end is also guarded, so a stream that closed on its own in
     * the meantime is simply a no-op.
     *
     * Then the minirev stream itself goes, because that stream *is* the binding:
     * closing it is what makes the device stop listening on the port. Closing
     * conn is the only unbind mechanism — without it the device keeps accepting
     * connections for a removed forward, and we answer them with A_OPEN for a
     * spec the user's server no longer has in reverse_forwards_ — LOG(FATAL),
     * their adb dies (adb.cpp:500).
     *
     * The order is load-bearing: every stream writes its FIN frame into this
     * same conn, so they must close while it is still open.
     */
    end(): void {
        this.ended = true
        for (const stream of this.streams.values()) {
            stream.end()
        }
        this.conn.end()
    }

    /**
     * The device end of one reverse connection: minirev's multiplexing frame,
     * `[uint16LE connId][uint16LE length]` followed by the payload.
     *
     * Same layout MinirevWriter writes; minirev is a vendored binary with no
     * source in the tree, so its own working client is the only specification
     * for these four bytes.
     *
     * No splitting here, unlike MinirevWriter: these bytes come out of a single
     * A_WRTE, and adbkit caps maxPayload at UINT16_MAX when it negotiates A_CNXN
     * (socket.js:135), so the length always fits the 16-bit field.
     */
    private deviceSink(connId: number): ReverseDevice {
        return {
            write: (chunk: Buffer) => {
                const frame = Buffer.alloc(FRAME_HEADER_SIZE + chunk.length)
                frame.writeUInt16LE(connId, 0)
                frame.writeUInt16LE(chunk.length, 2)
                chunk.copy(frame, FRAME_HEADER_SIZE)
                this.conn.write(frame)
            },
            // Slice 7: signal to the device that this connection is over by writing
            // a zero-length frame — [uint16LE connId][uint16LE 0] — exactly what
            // MinirevWriter._flush writes and MinirevReader turns back into
            // ('packet', connId, null) on the other end. Without this the app
            // on the device holds its socket open forever, waiting on a connection
            // that was already closed on the user side. Note: this.conn is the shared minirev stream for
            // the *whole* forward; we never call conn.end() here.
            end: () => {
                const fin = Buffer.alloc(FRAME_HEADER_SIZE)
                fin.writeUInt16LE(connId, 0)
                fin.writeUInt16LE(0, 2)
                this.conn.write(fin)
            },
        }
    }
}
