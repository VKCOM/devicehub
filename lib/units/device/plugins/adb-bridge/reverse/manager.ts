/**
 * All reverse connections arriving on one bound reverse forward.
 *
 * One instance per `adb reverse` binding. Every connection an app makes to the
 * reversed device port reaches us as its own adb stream to the reverse helper
 * on the device (helper.ts: the helper accepts it and we attach a stream by its
 * token); here it becomes a stream on the user's side: we push an A_OPEN at
 * them so the connection is made on *their* machine.
 */

import {ReverseStream, type ReverseDevice} from './stream.ts'
import {release, type ServiceHost} from '../service.ts'
import type {ReverseForwards} from './forwards.ts'

/** The connection reverse streams are opened on; see ServiceHost. */
export type ReverseHostSocket = ServiceHost

export class ReverseStreamManager {
    private streams = new Set<ReverseStream>()
    /** True once the forward is torn down; no further connection may be opened. */
    private ended = false

    constructor(
        private socket: ReverseHostSocket,
        private remote: string,
        private forwards: ReverseForwards
    ) {}

    /** An app on the device connected to the reversed port. */
    accept(device: ReverseDevice): void {
        // The local spec is resolved per connection, never cached: a killforward
        // or a teardown between the bind and this connection must stop us from
        // opening a stream the user's server no longer allows — it answers an
        // unrecognised A_OPEN with LOG(FATAL) (adb.cpp:500). The app sees its
        // connection closed, as on a device whose listener just went away.
        const local = this.ended ? undefined : this.forwards.resolveLocal(this.remote)
        if (!local) {
            // Not ours to read from any more, but adbkit-style rule all the same:
            // an error with no listener would be an uncaught exception
            device.on('error', () => {})
            release(device)
            return
        }

        const localId = this.socket.remoteId.next()
        const stream: ReverseStream = new ReverseStream(this.socket, localId, local, device, () => {
            // Removed from both maps when the stream closes, from either side.
            // Without this ServiceMap.insert would throw on id reuse once the
            // counter wraps, and this.streams would leak one entry per connection.
            this.socket.services.remove(localId)
            this.streams.delete(stream)
        })
        this.streams.add(stream)
        // Registered before the A_OPEN goes out, not after: the connection routes
        // every A_OKAY/A_WRTE/A_CLSE by arg1 through this map, so the answer to
        // our open has nowhere to land until the entry exists.
        this.socket.services.insert(localId, stream)
        stream.open()
    }

    /**
     * The forward itself is going away — `adb reverse --remove`, the end of the
     * `adb connect` session, or the device leaving the group.
     *
     * Every connection still open under it is closed, in both directions: each
     * stream sends its own A_CLSE to the user and hangs up its device socket, so
     * nothing is left holding a socket that will never be served. The listener
     * and the device-side reverse are the binding's to close (session.ts).
     *
     * Deleting from `this.streams` while iterating it is safe: each close runs
     * the stream's onEnd, which removes that stream's own entry, and a Set
     * iterator skips entries deleted behind it rather than losing its place.
     */
    end(): void {
        this.ended = true
        for (const stream of this.streams) {
            stream.end()
        }
    }
}
