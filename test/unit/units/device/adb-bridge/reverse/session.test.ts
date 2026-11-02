import {describe, it, expect} from 'vitest'
import {EventEmitter} from 'node:events'
import {Duplex} from 'node:stream'
// Oracle: adbkit's own command constants and packet encoder. The bare
// '@u4/adbkit' import must stay first to break the dist import cycle; see
// packet.test.ts for the full explanation. Do not reorder.
import '@u4/adbkit'
import AdbkitPacket from '../../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/packet.js'
import ServiceMap from '../../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/servicemap.js'
import RollingCounter from '../../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/rollingcounter.js'
import {isReverseOpen, ReverseSession} from '../../../../../../lib/units/device/plugins/adb-bridge/reverse/session.ts'

/**
 * Stand-in for adbkit's PacketReader: an event emitter whose only 'packet'
 * listener is the socket's own bound _handle, which is exactly the state a real
 * Socket leaves its reader in (socket.js:57-58).
 */
function fakeReader() {
    const delegated: unknown[] = []
    const reader = new EventEmitter()
    reader.on('packet', (packet: unknown) => delegated.push(packet))
    return {reader, delegated}
}

/** Stand-in for adbkit's tcpusb Socket, with its real id counter and service map. */
function fakeSocket(reader: unknown) {
    const writes: Buffer[] = []
    return {
        authorized: true,
        ended: false,
        end() { this.ended = true },
        maxPayload: 4096,
        writes,
        reader,
        remoteId: new RollingCounter(0xffffffff),
        services: new ServiceMap(),
        // Encoded by adbkit, the oracle for what goes on the wire
        send(command: number, arg0: number, arg1: number, data?: Buffer) {
            writes.push(AdbkitPacket.assemble(command, arg0, arg1, data))
        },
    }
}

/**
 * Stand-in for the device side of one bound forward (helper.ts): the session
 * hands it `accept`, called for every app connection, and `lost`, called if the
 * device-side helper dies.
 */
class FakeBinding {
    closed = 0
    constructor(
        readonly port: number,
        readonly accept: (device: Duplex) => void,
        readonly lost: () => void
    ) {}
    close() {
        this.closed += 1
    }
    /** An app on the device connects to the port. */
    connect(): Duplex {
        const device = new Duplex({read() {}, write(_chunk, _encoding, callback) { callback() }})
        this.accept(device)
        return device
    }
}

/** An OpenReverse that binds every port it is asked for, keeping what it made. */
function devicePorts() {
    const bindings: FakeBinding[] = []
    const openReverse = async(port: number, accept: (device: Duplex) => void, lost: () => void) => {
        const binding = new FakeBinding(port, accept, lost)
        bindings.push(binding)
        return binding
    }
    return {bindings, openReverse, ports: () => bindings.map(b => b.port)}
}

function openPacket(name: string) {
    return {command: AdbkitPacket.A_OPEN, arg0: 31, arg1: 0, data: Buffer.from(`${name}\0`)}
}

describe('isReverseOpen', () => {
    it('claims only an A_OPEN whose service name is a reverse: request', () => {
        expect(isReverseOpen(openPacket('reverse:list-forward'))).toBe(true)
        expect(isReverseOpen(openPacket('shell:ls'))).toBe(false)
    })

    // A payload is only a service name on an A_OPEN. The same bytes inside an
    // A_WRTE are a user's data — stdin of a shell session, a file being pushed —
    // and hijacking those would corrupt the stream they belong to.
    it('does not claim a data packet that merely looks like one', () => {
        expect(isReverseOpen({
            command: AdbkitPacket.A_WRTE,
            arg0: 31,
            arg1: 2,
            data: Buffer.from('reverse:forward:tcp:1;tcp:2\0'),
        })).toBe(false)
    })

    // adbkit throws 'Empty service name' for a payload shorter than 2 bytes
    // (socket.js:213-215) and we must not crash ahead of it on a missing payload.
    it('does not claim an A_OPEN with no payload', () => {
        expect(isReverseOpen({command: AdbkitPacket.A_OPEN, arg0: 31, arg1: 0})).toBe(false)
    })
})

/** A promise the test settles by hand, to observe what happens while it is pending. */
function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (err: Error) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return {promise, resolve, reject}
}

describe('ReverseSession.serve: binding a forward', () => {
    // A device runs install_listener to completion before handle_forward_request
    // answers (adb.cpp:1205-1212), so it never reports OKAY for a listener that is
    // not up. Answering first would leave the user holding a forward we cannot
    // serve, and an app connecting as soon as `adb reverse` returned would be
    // refused.
    it('puts the listener up on the device before it answers the user', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const ports: number[] = []
        const gate = deferred<FakeBinding>()
        const session = new ReverseSession(socket as never, (port: number) => {
            ports.push(port)
            return gate.promise
        })

        const served = session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))

        // The bind is the remote spec's port — what the device listens on — not the
        // local one it forwards to; mixing them up would bind the user's port here.
        // The local spec never leaves the session: on the device or the provider
        // it would name a port of theirs, not of the user's.
        expect(ports).toEqual([7777])
        expect(socket.writes).toEqual([])

        gate.resolve(new FakeBinding(7777, () => {}, () => {}))
        await served

        expect(socket.writes.length).toBe(3)
        expect(socket.writes[1].subarray(24).toString()).toBe('OKAY')
    })

    // A listener that cannot come up is reported in the reply, not by refusing the
    // stream. reverse_service hands handle_forward_request one end of a socketpair
    // and returns the other whatever it decides (daemon/services.cpp:69-84), so the
    // fd is valid even for a failed bind and the exchange is the usual three
    // packets. The A_CLSE(arg0=0) failed-open form belongs to a service that could
    // not be created at all, which `reverse:` never is.
    it('answers a bind it could not put up with FAIL and the reason', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const session = new ReverseSession(socket as never, async() => {
            throw new Error('cannot bind to 7777: Address already in use')
        })

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))

        // "cannot bind listener: <reason>" is AOSP's INSTALL_STATUS_CANNOT_BIND
        // text, where the reason comes from socket_spec_listen (adb.cpp:1226-1228).
        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_OKAY, 2, 31),
            AdbkitPacket.assemble(
                AdbkitPacket.A_WRTE, 2, 31,
                Buffer.from(
                    'FAIL0041cannot bind listener: cannot bind to 7777: Address already in use',
                    'ascii'
                )
            ),
            AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 2, 31),
        ])
    })

    // The map has to be rolled back, because exec() registered the forward before
    // we knew the bind would fail. adbd leaves nothing in listener_list when
    // install_listener fails, so `adb reverse --list` must not show the forward
    // either. Note this is not a LOG(FATAL) risk on its own — the user's server
    // snoops the request when it sends it (sockets.cpp:560) and keeps its entry
    // regardless — but our map is what gates the A_OPEN we push back, and it may
    // only ever be a subset of theirs.
    it('forgets a forward whose listener never came up', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const session = new ReverseSession(socket as never, async() => {
            throw new Error('cannot bind to 7777: Address already in use')
        })

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        socket.writes.length = 0
        await session.serve(openPacket('reverse:list-forward'))

        expect(socket.writes[1].subarray(24).toString()).toBe('0000')
    })

    // A rebind repurposes the listener that is already up; it does not replace it.
    // install_listener, on finding an existing listener for the same local_name,
    // assigns `l->connect_to = connect_to` and returns OK without touching the
    // socket — socket_spec_listen is only reached on the path that creates a new one
    // (adb_listeners.cpp:190-226). Tearing ours down and binding again would leave
    // the device port unbound for a moment and would cut the connections already
    // running through it, neither of which happens on a locally connected device.
    it('repurposes the listener it already has when the user rebinds a forward', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const device = devicePorts()
        const session = new ReverseSession(socket as never, device.openReverse)

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:9090'))
        socket.writes.length = 0
        await session.serve(openPacket('reverse:list-forward'))

        expect(device.ports()).toEqual([7777])
        expect(device.bindings[0].closed).toBe(0)
        // The forward now points at the new target, which is the whole purpose of
        // repurposing rather than rebuilding: the manager resolves the local spec
        // per connection, so the listener that is already up starts connecting to
        // 9090 with no gap.
        expect(socket.writes[1].subarray(24).toString()).toBe('001c(reverse) tcp:7777 tcp:9090\n')
        socket.writes.length = 0
        device.bindings[0].connect()
        expect(socket.writes[0].subarray(24).toString()).toBe('tcp:9090\0')
    })

    // A bind that failed leaves nothing behind, so asking again has to try again.
    // The failure is usually transient and the retry is the obvious next thing the
    // user does — the port was taken by something that has since exited, and
    // `adb reverse tcp:7777 tcp:8080` gets typed a second time.
    //
    // Treating that retry as a rebind is the worst of the failure modes available
    // here: we answer OKAY, bind nothing, and the forward appears in
    // `adb reverse --list` with no listener under it.
    it('binds again when the user retries a forward that failed', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const ports: number[] = []
        let failNext = true
        const session = new ReverseSession(socket as never, async(port: number, accept, lost) => {
            ports.push(port)
            if (failNext) {
                failNext = false
                throw new Error('cannot bind to 7777: Address already in use')
            }
            return new FakeBinding(port, accept, lost)
        })

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        socket.writes.length = 0
        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))

        expect(ports).toEqual([7777, 7777])
        expect(socket.writes[1].subarray(24).toString()).toBe('OKAY')
    })

    // The `adb connect` session ended while the device was still binding: the
    // listener that comes up afterwards belongs to nobody, and left open it would
    // keep the device port taken for good.
    it('closes a listener that comes up after the session ended', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const gate = deferred<FakeBinding>()
        const session = new ReverseSession(socket as never, () => gate.promise)

        const served = session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        session.end()
        const binding = new FakeBinding(7777, () => {}, () => {})
        gate.resolve(binding)
        await served

        expect(binding.closed).toBe(1)
    })

    // Same for a forward the user removed while it was being bound.
    it('closes a listener whose forward was removed while it came up', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const gate = deferred<FakeBinding>()
        const session = new ReverseSession(socket as never, () => gate.promise)

        const served = session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        await session.serve(openPacket('reverse:killforward:tcp:7777'))
        const binding = new FakeBinding(7777, () => {}, () => {})
        gate.resolve(binding)
        await served

        expect(binding.closed).toBe(1)
    })
})

// A `reverse:` command that needs nothing from the device is answered entirely
// from our own state. The wire sequence is fixed by AOSP's reverse_service
// (daemon/services.cpp:69-84): it hands handle_forward_request one end of a
// socketpair, closes it, and returns the other — so the stream carries the reply
// and then hits EOF. Three packets from us, in this order, every time.
describe('ReverseSession.serve: commands answered without the device', () => {
    it('answers list-forward with OKAY, the reply bytes and a close', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const session = new ReverseSession(socket as never, devicePorts().openReverse)

        await session.serve(openPacket('reverse:list-forward'))

        // localId 2 is the first id RollingCounter hands out; 31 is their arg0.
        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_OKAY, 2, 31),
            // No forward is bound, so format_listeners produces nothing and the
            // protocol string is a bare length of zero. list-forward is the one
            // reply with no OKAY prefix (adb.cpp:1137-1143).
            AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 2, 31, Buffer.from('0000', 'ascii')),
            // arg0 is our localId, not 0: the open succeeded, we just sent A_OKAY
            // for it. Zero there is the protocol's failed-open form (adb.cpp:597).
            AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 2, 31),
        ])
    })

    // A refusal travels the same three packets, only with FAIL in the payload.
    // Failing to open the stream instead would be wrong: reverse_service returns a
    // valid fd whatever handle_forward_request decides, so the user's client is
    // waiting to read a reason, not to see the open rejected.
    it('answers an unrecognised reverse: command with FAIL and its reason', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const session = new ReverseSession(socket as never, devicePorts().openReverse)

        await session.serve(openPacket('reverse:nonsense'))

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_OKAY, 2, 31),
            AdbkitPacket.assemble(
                AdbkitPacket.A_WRTE, 2, 31,
                Buffer.from('FAIL0020not a reverse forwarding command', 'ascii')
            ),
            AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 2, 31),
        ])
    })

    // Each command stream needs its own id out of the socket's own counter. Reusing
    // one would collide with the client's streams in the same ServiceMap, and their
    // server routes by it — two live streams under one id cross their traffic.
    it('takes a fresh id from the socket counter for each command', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const session = new ReverseSession(socket as never, devicePorts().openReverse)

        await session.serve(openPacket('reverse:list-forward'))
        await session.serve(openPacket('reverse:list-forward'))

        expect(socket.writes[3]).toEqual(AdbkitPacket.assemble(AdbkitPacket.A_OKAY, 3, 31))
        expect(socket.writes[5]).toEqual(AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 3, 31))
    })

    // `adb reverse --list` has to report this session's own forwards, which is
    // only visible once the map is non-empty: with no forwards registered, a reply
    // that ignored the map entirely would produce the same empty '0000' string.
    // The column order is AOSP's format_listeners (adb_listeners.cpp:129-144) —
    // what the listener binds on the device first, where it connects second.
    it('reports the forwards it has bound when the user lists them', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const session = new ReverseSession(socket as never, devicePorts().openReverse)

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        socket.writes.length = 0
        await session.serve(openPacket('reverse:list-forward'))

        expect(socket.writes[1].subarray(24).toString()).toBe('001c(reverse) tcp:7777 tcp:8080\n')
    })

    // Per-session isolation: the map decides which specs we may open on the
    // user's machine, so one session seeing another's forwards would be one user
    // reaching another's loopback.
    it('lists only its own forwards', async() => {
        const device = devicePorts()
        const mine = fakeSocket(fakeReader().reader)
        const theirs = fakeSocket(fakeReader().reader)
        const session = new ReverseSession(mine as never, device.openReverse)
        const other = new ReverseSession(theirs as never, device.openReverse)

        await other.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        await session.serve(openPacket('reverse:list-forward'))

        expect(mine.writes[1].subarray(24).toString()).toBe('0000')
    })
})

// Removing a bound forward must close its listener so the device stops
// listening. The user sees this as `adb reverse --remove tcp:7777` or
// `adb reverse --remove-all`.
describe('ReverseSession.serve: releasing forwards', () => {
    // killforward calls remove_listener, which closes the listening fd on the
    // device. If we skipped it, the device would keep the port open and we would
    // eventually push A_OPEN with a spec the user's server no longer knows ->
    // LOG(FATAL).
    it('closes the device listener when the user removes a forward', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const device = devicePorts()
        const session = new ReverseSession(socket as never, device.openReverse)

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        socket.writes.length = 0
        await session.serve(openPacket('reverse:killforward:tcp:7777'))

        expect(device.bindings[0].closed).toBe(1)
        expect(socket.writes[1].subarray(24).toString()).toBe('OKAY')
    })

    // ...and every connection still running through it goes too.
    it('closes the connections of a forward the user removes', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const device = devicePorts()
        const session = new ReverseSession(socket as never, device.openReverse)
        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        const app = device.bindings[0].connect()

        await session.serve(openPacket('reverse:killforward:tcp:7777'))
        await new Promise<void>(r => setImmediate(r))

        expect(app.destroyed).toBe(true)
    })

    // After a forward is removed its slot in `bound` must be cleared, or the
    // next `adb reverse tcp:7777 tcp:8080` would be misread as a rebind: we
    // would answer OKAY, touch nothing, and leave the user with a forward in
    // `--list` whose listener is not actually up.
    it('allows a fresh bind after the forward is removed', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const device = devicePorts()
        const session = new ReverseSession(socket as never, device.openReverse)

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        await session.serve(openPacket('reverse:killforward:tcp:7777'))
        socket.writes.length = 0
        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:9090'))

        expect(device.ports()).toEqual([7777, 7777])
        expect(socket.writes[1].subarray(24).toString()).toBe('OKAY')
    })

    // `adb reverse --remove` on a forward that was never bound gets FAIL from
    // adbd (adb_listeners.cpp: remove_listener returns NOT_FOUND). There is
    // nothing to release — but the reply must still follow the standard
    // three-packet path.
    it('answers killforward for an unknown forward with FAIL', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const session = new ReverseSession(socket as never, devicePorts().openReverse)

        await session.serve(openPacket('reverse:killforward:tcp:9999'))

        // "listener 'tcp:9999' not found" is AOSP's INSTALL_STATUS_LISTENER_NOT_FOUND
        // text (adb.cpp:1232-1234); the hex length encodes the reason string only.
        const payload = socket.writes[1].subarray(24).toString()
        expect(payload).toBe("FAIL001dlistener 'tcp:9999' not found")
    })

    // killforward-all should close every listener, mirroring what a
    // locally-connected device does when it calls remove_all_listeners.
    it('closes every listener when the user removes all forwards', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const device = devicePorts()
        const session = new ReverseSession(socket as never, device.openReverse)

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        await session.serve(openPacket('reverse:forward:tcp:9999;tcp:3000'))
        socket.writes.length = 0
        await session.serve(openPacket('reverse:killforward-all'))

        expect(device.bindings.map(b => b.closed)).toEqual([1, 1])
    })

    // session.end() is called when the `adb connect` session ends: the socket
    // disconnects, the device leaves its group, or the plugin stops. It must
    // release everything, so the same as killforward-all but without an answer.
    it('session.end() closes every listener', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const device = devicePorts()
        const session = new ReverseSession(socket as never, device.openReverse)

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        await session.serve(openPacket('reverse:forward:tcp:9999;tcp:3000'))
        session.end()

        expect(device.bindings.map(b => b.closed)).toEqual([1, 1])
    })

    // The device-side helper died: the device no longer listens, so the forward
    // is forgotten as if removed — `--list` stays honest — and the next
    // `adb reverse` for it binds for real rather than being taken for a rebind.
    it('forgets a forward whose device listener was lost, and binds it again', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const device = devicePorts()
        const session = new ReverseSession(socket as never, device.openReverse)
        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))

        device.bindings[0].lost()
        socket.writes.length = 0
        await session.serve(openPacket('reverse:list-forward'))
        expect(socket.writes[1].subarray(24).toString()).toBe('0000')

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        expect(device.ports()).toEqual([7777, 7777])
    })
})

// Once a forward is bound, every app connection to the port must turn into an
// A_OPEN at the user with the forward's local spec.
describe('ReverseSession.serve: routing device connections after a successful bind', () => {
    it('opens a connection on the user side when an app connects after binding', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const device = devicePorts()
        const session = new ReverseSession(socket as never, device.openReverse)

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        socket.writes.length = 0

        device.bindings[0].connect()

        // Bytes 0-23 are the fixed-length ADB message header; data starts at 24.
        expect(socket.writes[0].subarray(24).toString()).toBe('tcp:8080\0')
    })

    // Two forwards in one session: a connection on each must open a stream with
    // the *correct* local spec. Without this test, passing the wrong `remote` to
    // the manager (e.g. command.local instead of command.remote) would be
    // invisible, because with only one forward both resolve the same.
    it('routes a connection to the correct forward when two are bound', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const device = devicePorts()
        const session = new ReverseSession(socket as never, device.openReverse)

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        await session.serve(openPacket('reverse:forward:tcp:9999;tcp:3000'))
        socket.writes.length = 0

        device.bindings[1].connect()

        expect(socket.writes[0].subarray(24).toString()).toBe('tcp:3000\0')
    })
})
