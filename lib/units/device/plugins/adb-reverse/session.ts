/**
 * The reverse side of one `adb connect` session.
 *
 * `reverse:` requests must never reach adbkit's `Service`, which relays every
 * service name to the *provider's* adb server (service.js: client.getDevice()
 * .transport()). That server snoops the request itself and the real adbd binds a
 * listener on the device, so every reverse connection ends up on the provider
 * host's loopback rather than the user's — a forward that appears to work while
 * pointing at the wrong machine, and an opening onto the provider's local
 * services (ADB-REVERSE-PLAN.md §3.5). We answer those requests here instead,
 * and tunnel the connections back to the user inside this same socket.
 *
 * Everything lives in this module rather than in connect.ts because connect.ts
 * is a syrup plugin with nine dependencies and no way to unit-test; the only
 * things it needs to know are `attachReverse` and `session.end()`.
 */

import type {ReversePacket} from './stream.ts'
import {ReverseStreamManager, type ReverseHostSocket, type ReverseConn} from './manager.ts'

import {ReverseForwards} from './forwards.ts'
import {fail, replyFor} from './replies.ts'
import {assemble, A_OPEN, A_OKAY, A_WRTE, A_CLSE} from './packet.ts'
import {MinirevReader} from './minirevReader.ts'

const REVERSE_PREFIX = 'reverse:'

/**
 * The minirev stream for one bound forward: a Duplex that can be piped into
 * MinirevReader. Extends ReverseConn (what the manager needs) with pipe
 * (what MinirevReader needs). Declared here rather than widening ReverseConn
 * in manager.ts, so manager tests' fake conns do not have to implement pipe.
 */
export interface MinirevStream extends ReverseConn {
    pipe<T>(destination: T): T
    on(event: string, listener: (...args: unknown[]) => void): unknown
}

/** The minirev stream for one bound forward; injected so this module needs no adb. */
export type OpenMinirev = (devicePort: number) => Promise<MinirevStream>

/**
 * The service name carried by an A_OPEN.
 *
 * adbkit's `_skipNull` drops exactly one trailing byte (socket.js:259-261), but
 * AOSP calls StripTrailingNulls on the same field, so we follow AOSP and drop
 * them all: the name was historically read as a char* that stopped at the first
 * NUL, and a sender may pad it.
 */
function serviceName(data: Buffer): string {
    let end = data.length
    while (end > 0 && data[end - 1] === 0) {
        end--
    }
    return data.toString('utf8', 0, end)
}

/**
 * Whether this packet is a `reverse:` request we have to serve ourselves.
 *
 * Synchronous and side-effect free by design: the wrapper below has to decide
 * whether to delegate before it may await anything, or packets would be
 * reordered on their way to adbkit.
 *
 * A payload is only a service name on an A_OPEN — the same bytes inside an
 * A_WRTE are user data (the stdin of a shell, a file being pushed), and claiming
 * those would corrupt the stream they belong to.
 */
export function isReverseOpen(packet: ReversePacket): boolean {
    if (packet.command !== A_OPEN || !packet.data) {
        return false
    }
    return serviceName(packet.data).startsWith(REVERSE_PREFIX)
}

/** The `reverse:` state of a single `adb connect` session. */
export class ReverseSession {
    /**
     * This session's mirror of the user's own reverse allow-list.
     *
     * Strictly per-socket, never shared: the map is what decides which specs we
     * may open on the user's machine, so one session seeing another's entries
     * would be one user reaching another's loopback.
     */
    private forwards = new ReverseForwards()

    /**
     * The live state of each bound forward, keyed by remote spec.
     *
     * Presence is what tells a rebind from a fresh bind (fact 32): if the key is
     * here the listener is up and the manager is running; if it is absent the
     * bind either never happened or failed and was rolled back.
     */
    private bound = new Map<string, {conn: MinirevStream; manager: ReverseStreamManager}>()

    constructor(
        private socket: ReverseSessionSocket,
        private openMinirev: OpenMinirev
    ) {}

    /**
     * Serve one intercepted `reverse:` A_OPEN.
     *
     * Three packets go back, which is what a real adbd puts on the wire for this
     * service: reverse_service writes the reply into a socketpair and closes its
     * end immediately (daemon/services.cpp:69-84), so the stream carries the
     * open acknowledgement, the reply bytes, and a close.
     *
     * The stream is not registered in socket.services: it is over by the time we
     * return, and the user's A_OKAY/A_CLSE for it will simply find nothing there,
     * which adbkit logs as a packet for an already-closed service and drops
     * (socket.js:245-248). The id still has to come from the socket's own counter
     * so it cannot collide with a client stream.
     */
    async serve(packet: ReversePacket): Promise<void> {
        const name = packet.data ? serviceName(packet.data) : ''
        const command = this.forwards.exec(name)

        /** Set only when the bind failed; otherwise the reply comes from the map. */
        let bindFailure: Buffer | undefined

        // A rebind keeps the listener it already has. install_listener does not
        // recreate one whose local_name matches: it overwrites connect_to and
        // returns OK on the same fd (adb_listeners.cpp:190-215). `exec` has already
        // rewritten the map, and ReverseStreamManager resolves the target per
        // connection, so the existing stream picks the new one up by itself.
        // Rebinding for real would be worse than the device we are imitating: a
        // window where the port is not listening, and every live connection through
        // it cut.
        if (command.action === 'bind' && !this.bound.has(command.remote)) {
            // The listener goes up before the user hears anything. A device runs
            // install_listener to completion inside handle_forward_request and only
            // then answers (adb.cpp:1205-1212), so it never reports OKAY for a
            // listener that is not up. Answering first would leave the user holding
            // a forward we cannot serve, and the A_OPEN we would later push for it
            // names a spec their own server never snooped -> LOG(FATAL)
            // (adb.cpp:500). The cost is one openLocal round-trip, which the user's
            // adb client is blocked on anyway.
            try {
                // Recorded only once the stream is actually up. Marking the remote
                // before awaiting would make a retry after a failed bind look like a
                // rebind: we would answer OKAY, bind nothing, and leave the user with
                // a forward in `--list` whose connections hang.
                const conn = await this.openMinirev(command.devicePort)
                const manager = new ReverseStreamManager(this.socket, command.remote, this.forwards, conn)
                // Wire minirev frames through MinirevReader, which parses
                // [uint16LE connId][uint16LE len] headers and emits
                // ('packet', connId, data) — or ('packet', connId, null) for a
                // zero-length FIN frame. The empty 'readable' listener is required:
                // without it the Transform stays in paused mode and never emits 'end'
                // (same pattern as ForwardHandler in the former forward plugin).
                conn.pipe(new MinirevReader())
                    .on('packet', (id: number, data: Buffer | null) => manager.handlePacket(id, data))
                    .on('readable', () => {})
                this.bound.set(command.remote, {conn, manager})
            }
            catch (err) {
                // `exec` registered the forward as it parsed the request, so a bind
                // that never came up has to be taken back out. The user's own server
                // keeps its entry either way — it snoops the request when it sends it
                // to us (sockets.cpp:560), long before it can know the outcome — so
                // our map is always a subset of theirs, which is the safe direction:
                // a spec they know and we do not costs nothing, while the reverse is
                // the LOG(FATAL). What it does buy us is an honest
                // `adb reverse --list`, matching a device where a failed
                // install_listener leaves nothing in listener_list.
                this.forwards.exec(`${REVERSE_PREFIX}killforward:${command.remote}`)
                // INSTALL_STATUS_CANNOT_BIND: "cannot bind listener: %s", where %s is
                // whatever the listen attempt reported (adb.cpp:1226-1228). replyFor
                // has no branch for this — the parse succeeded, the bind is what
                // failed — so the bytes are built here.
                bindFailure = fail(`cannot bind listener: ${err instanceof Error ? err.message : String(err)}`)
            }
        }

        // Teardown for remove commands. killforward calls remove_listener which
        // closes the listening fd on the device — the only mechanism available
        // is conn.end() via manager.end() (fact 23). Skipping this leaves the
        // device port listening and, when an app connects, we push A_OPEN with
        // a spec the user's server no longer knows -> LOG(FATAL) (adb.cpp:500).
        //
        // Note: exec() already updated forwards before we get here, so
        // listener-not-found means there is no manager to end.
        if (command.action === 'unbind') {
            const entry = this.bound.get(command.remote)
            if (entry) {
                entry.manager.end()
                this.bound.delete(command.remote)
            }
        } else if (command.action === 'unbind-all') {
            for (const {manager} of this.bound.values()) {
                manager.end()
            }
            this.bound.clear()
        }

        const localId = this.socket.remoteId.next()
        const theirId = packet.arg0

        this.socket.write(assemble(A_OKAY, localId, theirId))
        this.socket.write(assemble(A_WRTE, localId, theirId, bindFailure ?? replyFor(command, this.forwards)))
        // arg0 is our id, not 0: the open did succeed — we acknowledged it above.
        // Zero here is the protocol's failed-open form (adb.cpp:597).
        this.socket.write(assemble(A_CLSE, localId, theirId))
    }

    /** Drop every forward this session bound. */
    end(): void {
        for (const {manager} of this.bound.values()) {
            manager.end()
        }
        this.bound.clear()
    }
}

/**
 * Take `reverse:` requests over on an adbkit tcpusb Socket.
 *
 * The Socket wires its reader up in its constructor —
 * `new PacketReader(this.socket).on('packet', this._handle.bind(this))`
 * (socket.js:57-58) — and keeps no reference to that bound function, so the only
 * way to get in front of it is to read the listeners off the reader, remove them
 * and install one that delegates. That is safe to do from the 'connection'
 * handler: `server.js` emits 'connection' synchronously from the Socket
 * constructor, while PacketReader defers its first read to setImmediate
 * (packetreader.js:38), so no packet can arrive before we are in place.
 */
export function attachReverse(socket: ReverseHostSocketWithReader, openMinirev: OpenMinirev): ReverseSession {
    const session = new ReverseSession(socket, openMinirev)
    const reader = socket.reader
    // Every listener is captured, not just the first: a real Socket has only its
    // own bound _handle there, but dropping a listener somebody else installed
    // would be a regression we could not see.
    const original = reader.listeners('packet') as ((packet: ReversePacket) => void)[]

    reader.removeAllListeners('packet')
    reader.on('packet', (packet: ReversePacket) => {
        if (isReverseOpen(packet)) {
            session.serve(packet)
            return
        }
        for (const listener of original) {
            listener(packet)
        }
    })

    return session
}

/**
 * What a session needs from adbkit's tcpusb Socket: somewhere to write, and the
 * socket's own id counter and service map, which the reverse streams share with
 * the client's streams (see ReverseHostSocket in manager.ts).
 */
export type ReverseSessionSocket = ReverseHostSocket

/**
 * The same Socket plus its packet reader, which is what `attachReverse` gets in
 * connect.ts. `reader`, `services` and `remoteId` are all declared private in
 * socket.d.ts, so the caller needs a cast; TS-private is a compile-time notion
 * only and every one of those fields is there at runtime.
 */
export interface ReverseHostSocketWithReader extends ReverseSessionSocket {
    reader: {
        listeners(event: string): unknown[]
        removeAllListeners(event: string): unknown
        on(event: string, listener: (packet: ReversePacket) => void): unknown
    }
}
