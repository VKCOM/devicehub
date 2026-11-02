/**
 * The reverse side of one `adb connect` session.
 *
 * `reverse:` requests must never be relayed to the *provider's* adb server like
 * other services (serveOpen). That server snoops the request itself and the real
 * adbd binds a listener on the device, so every reverse connection would end up
 * on the provider host's loopback rather than the user's — a forward that
 * appears to work while pointing at the wrong machine, and an opening onto the
 * provider's local services (ADB-REVERSE-PLAN.md §3.5). We answer those requests
 * here instead, and tunnel the connections back to the user inside this same
 * socket.
 */

import {ReverseStreamManager, type ReverseHostSocket} from './manager.ts'
import {ReverseForwards} from './forwards.ts'
import {fail, replyFor} from './replies.ts'
import {serviceName, A_OPEN, A_OKAY, A_WRTE, A_CLSE, type Packet} from '../packet.ts'
import type {ReverseDevice} from './stream.ts'
import {ackPayload, RECEIVE_WINDOW} from '../flow.ts'

const REVERSE_PREFIX = 'reverse:'

/** A device port listening for us: one bound forward (helper.ts). */
export interface ReverseBinding {
    /** Stop listening on the device; connections already open carry on */
    close(): void
}

/**
 * Listen on `devicePort` on the device and hand every connection made to it to
 * `accept`. Resolves once the port is really listening; rejects with the reason
 * when it cannot be. `lost` is called if the listener goes away on its own —
 * the device-side helper died — but never after close(). Injected so this
 * module needs no adb.
 */
export type OpenReverse = (
    devicePort: number,
    accept: (device: ReverseDevice) => void,
    lost: () => void
) => Promise<ReverseBinding>

/**
 * Whether this packet is a `reverse:` request we have to serve ourselves.
 *
 * Synchronous and side-effect free by design: the connection dispatches
 * packets synchronously, and awaiting here would reorder them.
 *
 * A payload is only a service name on an A_OPEN — the same bytes inside an
 * A_WRTE are user data (the stdin of a shell, a file being pushed), and claiming
 * those would corrupt the stream they belong to.
 */
export function isReverseOpen(packet: Packet): boolean {
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
    private bound = new Map<string, {binding: ReverseBinding; manager: ReverseStreamManager}>()
    /** True once the session is over; a bind still in flight must not outlive it. */
    private ended = false

    constructor(
        private socket: ReverseSessionSocket,
        private openReverse: OpenReverse
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
     * return, and the user's A_OKAY/A_CLSE for it will simply find nothing there
     * and be dropped by the connection, as a packet for an already-closed stream.
     * The id still has to come from the socket's own counter
     * so it cannot collide with a client stream.
     */
    async serve(packet: Packet): Promise<void> {
        const name = packet.data ? serviceName(packet.data) : ''
        const command = this.forwards.exec(name)

        /** Set only when the bind failed; otherwise the reply comes from the map. */
        let bindFailure: Buffer | undefined

        // A rebind keeps the listener it already has. install_listener does not
        // recreate one whose local_name matches: it overwrites connect_to and
        // returns OK on the same fd (adb_listeners.cpp:190-215). `exec` has already
        // rewritten the map, and ReverseStreamManager resolves the target per
        // connection, so the existing listener picks the new one up by itself.
        // Rebinding for real would be worse than the device we are imitating: a
        // window where the port is not listening, and every live connection through
        // it cut.
        if (command.action === 'bind' && !this.bound.has(command.remote)) {
            // The listener goes up before the user hears anything. A device runs
            // install_listener to completion inside handle_forward_request and only
            // then answers (adb.cpp:1205-1212), so it never reports OKAY for a
            // listener that is not up. Answering first would leave the user holding
            // a forward we cannot serve, and an app connecting right after their
            // `adb reverse` returned would be refused. The cost is one round trip
            // to the device, which the user's adb client is blocked on anyway.
            try {
                // Recorded only once the listener is actually up. Marking the remote
                // before awaiting would make a retry after a failed bind look like a
                // rebind: we would answer OKAY, bind nothing, and leave the user with
                // a forward in `--list` whose connections are refused.
                const {remote} = command
                const manager = new ReverseStreamManager(this.socket, remote, this.forwards)
                const binding: ReverseBinding = await this.openReverse(
                    command.devicePort,
                    device => manager.accept(device),
                    () => this.lose(remote, binding)
                )
                // The session ended, or the user removed or rebound this forward,
                // while the device was answering: this listener is nobody's
                if (this.ended || this.bound.has(command.remote) || !this.forwards.resolveLocal(command.remote)) {
                    manager.end()
                    binding.close()
                }
                else {
                    this.bound.set(command.remote, {binding, manager})
                }
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

        // Teardown for remove commands. killforward calls remove_listener, which
        // closes the listening fd on the device; here that is the helper's control
        // stream. Skipping this leaves the device port listening and, when an app
        // connects, we push A_OPEN with a spec the user's server no longer knows
        // -> LOG(FATAL) (adb.cpp:500).
        //
        // Note: exec() already updated forwards before we get here, so
        // listener-not-found means there is nothing to release.
        if (command.action === 'unbind') {
            this.release(command.remote)
        }
        else if (command.action === 'unbind-all') {
            for (const remote of [...this.bound.keys()]) {
                this.release(remote)
            }
        }

        const localId = this.socket.remoteId.next()
        const theirId = packet.arg0

        // Under delayed ack an open's A_OKAY carries our window (adb.cpp:539-544);
        // the user's server ignores one without it and logs a mismatch
        this.socket.send(A_OKAY, localId, theirId, this.socket.delayedAck ? ackPayload(RECEIVE_WINDOW) : undefined)
        this.socket.send(A_WRTE, localId, theirId, bindFailure ?? replyFor(command, this.forwards))
        // arg0 is our id, not 0: the open did succeed — we acknowledged it above.
        // Zero here is the protocol's failed-open form (adb.cpp:597).
        this.socket.send(A_CLSE, localId, theirId)
    }

    /** Drop every forward this session bound. */
    end(): void {
        this.ended = true
        for (const remote of [...this.bound.keys()]) {
            this.release(remote)
        }
    }

    /**
     * The device stopped listening for a forward on its own: the helper died.
     * Forgotten as if the user had removed it, so `adb reverse --list` stays
     * honest and the next `adb reverse` for it binds again; the user's server
     * keeping its entry is the safe direction (see the bind failure above).
     */
    private lose(remote: string, binding: ReverseBinding): void {
        if (this.bound.get(remote)?.binding !== binding) {
            return
        }
        this.release(remote)
        this.forwards.exec(`${REVERSE_PREFIX}killforward:${remote}`)
    }

    /**
     * Close a forward's connections, then its listener. The order matters only
     * for tidiness: no new connection can be accepted for a manager that has
     * ended, whatever the device still has in flight.
     */
    private release(remote: string): void {
        const entry = this.bound.get(remote)
        if (entry) {
            this.bound.delete(remote)
            entry.manager.end()
            entry.binding.close()
        }
    }
}

/**
 * What a session needs from the bridge connection: somewhere to write, and the
 * connection's own id counter and service map, which the reverse streams share
 * with the client's streams (see ReverseHostSocket in manager.ts).
 */
export type ReverseSessionSocket = ReverseHostSocket
