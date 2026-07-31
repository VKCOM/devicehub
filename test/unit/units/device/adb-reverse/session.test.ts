import {describe, it, expect} from 'vitest'
import {EventEmitter} from 'node:events'
import {Duplex} from 'node:stream'
// Oracle: adbkit's own command constants and packet encoder. The bare
// '@u4/adbkit' import must stay first to break the dist import cycle; see
// packet.test.ts for the full explanation. Do not reorder.
import '@u4/adbkit'
import AdbkitPacket from '../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/packet.js'
import ServiceMap from '../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/servicemap.js'
import RollingCounter from '../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/rollingcounter.js'
import {attachReverse, isReverseOpen, ReverseSession} from '../../../../../lib/units/device/plugins/adb-reverse/session.ts'
import {MinirevWriter} from '../../../../../lib/units/device/plugins/adb-reverse/minirevWriter.ts'

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
        maxPayload: 4096,
        writes,
        reader,
        remoteId: new RollingCounter(0xffffffff),
        services: new ServiceMap(),
        write(chunk: Buffer) {
            writes.push(chunk)
            return true
        },
    }
}

/**
 * Stand-in for the minirev stream. A real Duplex, so the production code can pipe
 * it into MinirevReader and the framing is exercised for real rather than against
 * a reimplementation of it.
 */
class FakeMinirev extends Duplex {
    writes: Buffer[] = []
    ended = 0
    _write(chunk: Buffer, _enc: unknown, cb: () => void) {
        this.writes.push(Buffer.from(chunk))
        cb()
    }
    _read() {}
    end(...args: unknown[]) {
        this.ended += 1
        // @ts-ignore -- pass through to Duplex
        return super.end(...args)
    }
    /** Simulate minirev sending us bytes. */
    fromDevice(buf: Buffer) {
        this.push(buf)
    }
}

function openPacket(name: string) {
    return {command: AdbkitPacket.A_OPEN, arg0: 31, arg1: 0, data: Buffer.from(`${name}\0`)}
}

/**
 * Oracle for the minirev framing: MinirevWriter, the TypeScript port of the
 * former forward/util/writer.js. The layout ([uint16LE connId][uint16LE length])
 * is minirev's, and minirev is a vendored binary with no source in the tree,
 * so its own client is the only specification we have.
 */
function framedBy(connId: number, chunk: Buffer): Buffer {
    const writer = new MinirevWriter(connId)
    writer.write(chunk)
    return Buffer.concat(drain(writer))
}

/**
 * Oracle for minirev's end-of-connection marker, from MinirevWriter:
 * its _flush pushes a header with length 0, which is exactly what
 * MinirevReader turns back into a FIN on the receiving side.
 */
function finFramedBy(connId: number): Buffer {
    const writer = new MinirevWriter(connId)
    writer.end()
    return Buffer.concat(drain(writer))
}

function drain(writer: {read(): Buffer | null}): Buffer[] {
    const pieces: Buffer[] = []
    let piece: Buffer | null
    while ((piece = writer.read())) {
        pieces.push(piece)
    }
    return pieces
}

// This is the regression test for the bug the whole feature exists to fix. Today
// `reverse:` reaches adbkit's Service, which relays it to the *provider's* adb
// server (service.js:92-99: client.getDevice(serial).transport()). That server
// snoops the request, the real adbd binds a listener on the device, and every
// reverse connection then lands on the provider host's loopback instead of the
// user's — a broken forward and a hole onto the provider's local services
// (ADB-REVERSE-PLAN.md §3.5).
describe('attachReverse: taking over reverse: requests', () => {
    it('keeps a reverse: request away from adbkit, which would relay it to the provider adb server', () => {
        const {reader, delegated} = fakeReader()
        const socket = fakeSocket(reader)

        attachReverse(socket as never, async() => new FakeMinirev())
        reader.emit('packet', openPacket('reverse:forward:tcp:7777;tcp:8080'))

        expect(delegated).toEqual([])
    })

    // Interception must be surgical: the bridge carries every other adb service on
    // the same socket (shell:, sync:, the A_WRTE/A_OKAY traffic of open streams).
    // Swallowing or reordering any of it would break `adb connect` itself, which
    // works today.
    it('leaves every other packet to adbkit untouched', () => {
        const {reader, delegated} = fakeReader()
        const socket = fakeSocket(reader)
        const shell = openPacket('shell:ls')
        const write = {command: AdbkitPacket.A_WRTE, arg0: 31, arg1: 2, data: Buffer.from('x')}
        const connect = {command: AdbkitPacket.A_CNXN, arg0: 0x01000000, arg1: 4096, data: Buffer.from('host::\0')}

        attachReverse(socket as never, async() => new FakeMinirev())
        reader.emit('packet', shell)
        reader.emit('packet', write)
        reader.emit('packet', connect)

        expect(delegated).toEqual([shell, write, connect])
    })

    // A real Socket leaves exactly one listener on its reader, so keeping only
    // the first one would look correct forever here. Anything else sharing that
    // reader — a future adbkit version, instrumentation of our own — has to go on
    // working, and a dropped listener is invisible until something stops arriving.
    it('delegates to every listener that was already on the reader', () => {
        const {reader, delegated} = fakeReader()
        const alsoDelegated: unknown[] = []
        reader.on('packet', (packet: unknown) => alsoDelegated.push(packet))
        const socket = fakeSocket(reader)
        const shell = openPacket('shell:ls')

        attachReverse(socket as never, async() => new FakeMinirev())
        reader.emit('packet', shell)

        expect(delegated).toEqual([shell])
        expect(alsoDelegated).toEqual([shell])
    })
})

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
    // serve, and our A_OPEN for it would name a spec their own server never
    // snooped -> LOG(FATAL), their adb dies (adb.cpp:500).
    it('puts the listener up on the device before it answers the user', async() => {
        const {reader} = fakeReader()
        const socket = fakeSocket(reader)
        const ports: number[] = []
        const gate = deferred<FakeMinirev>()
        const session = new ReverseSession(socket as never, (port: number) => {
            ports.push(port)
            return gate.promise
        })

        const served = session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))

        // The bind is the remote spec's port — what the device listens on — not the
        // local one it forwards to; mixing them up would bind the user's port here.
        expect(ports).toEqual([7777])
        expect(socket.writes).toEqual([])

        gate.resolve(new FakeMinirev())
        await served

        expect(socket.writes.length).toBe(3)
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
    // (adb_listeners.cpp:190-226). Tearing ours down and opening a second minirev
    // stream would leave the device port unbound for a moment and would cut the
    // connections already running through it, neither of which happens on a locally
    // connected device.
    //
    // The two guard assertions below hold trivially today, since nothing tears a
    // forward down yet; they are here to fail the day slice 5.5's teardown is wired
    // to the wrong case. `unbind` must end the manager, a rebind must not — the
    // difference is that killforward calls remove_listener while a rebind does not.
    it('repurposes the listener it already has when the user rebinds a forward', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const ports: number[] = []
        const conns: FakeMinirev[] = []
        const session = new ReverseSession(socket as never, async(port: number) => {
            ports.push(port)
            const conn = new FakeMinirev()
            conns.push(conn)
            return conn
        })

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:9090'))
        socket.writes.length = 0
        await session.serve(openPacket('reverse:list-forward'))

        expect(ports).toEqual([7777])
        expect(conns.length).toBe(1)
        expect(conns[0].ended).toBe(0)
        // The forward now points at the new target, which is the whole purpose of
        // repurposing rather than rebuilding: the manager resolves the local spec
        // per connection, so the listener that is already up starts connecting to
        // 9090 with no gap.
        expect(socket.writes[1].subarray(24).toString()).toBe('001c(reverse) tcp:7777 tcp:9090\n')
    })

    // A bind that failed leaves nothing behind, so asking again has to try again.
    // The failure is usually transient and the retry is the obvious next thing the
    // user does — the port was taken by something that has since exited, and
    // `adb reverse tcp:7777 tcp:8080` gets typed a second time.
    //
    // Treating that retry as a rebind is the worst of the failure modes available
    // here: we answer OKAY, bind nothing, and the forward appears in
    // `adb reverse --list` with no listener under it. Nothing reports an error at
    // any point — the app on the device just finds the port closed.
    it('binds again when the user retries a forward that failed', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const ports: number[] = []
        let failNext = true
        const session = new ReverseSession(socket as never, async(port: number) => {
            ports.push(port)
            if (failNext) {
                failNext = false
                throw new Error('cannot bind to 7777: Address already in use')
            }
            return new FakeMinirev()
        })

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        socket.writes.length = 0
        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))

        expect(ports).toEqual([7777, 7777])
        expect(socket.writes[1].subarray(24).toString()).toBe('OKAY')
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
        const session = new ReverseSession(socket as never, async() => new FakeMinirev())

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
        const session = new ReverseSession(socket as never, async() => new FakeMinirev())

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
        const session = new ReverseSession(socket as never, async() => new FakeMinirev())

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
        const {reader} = fakeReader()
        const socket = fakeSocket(reader)
        const session = new ReverseSession(socket as never, async() => new FakeMinirev())

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        socket.writes.length = 0
        await session.serve(openPacket('reverse:list-forward'))

        expect(socket.writes[1].subarray(24).toString()).toBe('001c(reverse) tcp:7777 tcp:8080\n')
    })
})

// Slice 5.5: removing a bound forward must tear down its manager and free the
// minirev stream so the device stops listening. The user sees this as
// `adb reverse --remove tcp:7777` or `adb reverse --remove-all`.
describe('ReverseSession.serve: releasing forwards', () => {
    // killforward calls remove_listener, which closes the listening fd on the
    // device (fact 23). The only mechanism that closes a minirev listener is
    // conn.end(); manager.end() is responsible for calling it. If we skip
    // manager.end() the device keeps the port open and we eventually push
    // A_OPEN with a spec the user's server no longer knows -> LOG(FATAL).
    it('closes the minirev stream when the user removes a forward', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const conns: FakeMinirev[] = []
        const session = new ReverseSession(socket as never, async() => {
            const conn = new FakeMinirev()
            conns.push(conn)
            return conn
        })

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        socket.writes.length = 0
        await session.serve(openPacket('reverse:killforward:tcp:7777'))

        expect(conns[0].ended).toBe(1)
    })

    // After a forward is removed its slot in `bound` must be cleared, or the
    // next `adb reverse tcp:7777 tcp:8080` would be misread as a rebind: we
    // would answer OKAY, touch nothing, and leave the user with a forward in
    // `--list` whose listener is not actually up.
    it('allows a fresh bind after the forward is removed', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const ports: number[] = []
        const session = new ReverseSession(socket as never, async(port: number) => {
            ports.push(port)
            return new FakeMinirev()
        })

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        await session.serve(openPacket('reverse:killforward:tcp:7777'))
        socket.writes.length = 0
        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:9090'))

        // openMinirev must have been called twice.
        expect(ports).toEqual([7777, 7777])
        expect(socket.writes[1].subarray(24).toString()).toBe('OKAY')
    })

    // `adb reverse --remove` on a forward that was never bound gets FAIL from
    // adbd (adb_listeners.cpp: remove_listener returns NOT_FOUND). There is no
    // manager to end and nothing to clean up in `bound` — but the reply must
    // still follow the standard three-packet path.
    it('answers killforward for an unknown forward with FAIL', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const session = new ReverseSession(socket as never, async() => new FakeMinirev())

        await session.serve(openPacket('reverse:killforward:tcp:9999'))

        // "listener 'tcp:9999' not found" is AOSP's INSTALL_STATUS_LISTENER_NOT_FOUND
        // text (adb.cpp:1232-1234); the hex length encodes the reason string only.
        const payload = socket.writes[1].subarray(24).toString()
        expect(payload).toBe("FAIL001dlistener 'tcp:9999' not found")
    })

    // killforward-all should tear down every manager, mirroring what a
    // locally-connected device does when it calls remove_all_listeners.
    it('closes all minirev streams when the user removes all forwards', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const conns: FakeMinirev[] = []
        const session = new ReverseSession(socket as never, async() => {
            const conn = new FakeMinirev()
            conns.push(conn)
            return conn
        })

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        await session.serve(openPacket('reverse:forward:tcp:9999;tcp:3000'))
        socket.writes.length = 0
        await session.serve(openPacket('reverse:killforward-all'))

        expect(conns[0].ended).toBe(1)
        expect(conns[1].ended).toBe(1)
    })

    // session.end() is called when the `adb connect` session ends: the socket
    // disconnects, the device leaves its group, or the plugin stops. It must
    // release everything, so the same as killforward-all but without an answer.
    it('session.end() closes all bound managers', async() => {
        const socket = fakeSocket(fakeReader().reader)
        const conns: FakeMinirev[] = []
        const session = new ReverseSession(socket as never, async() => {
            const conn = new FakeMinirev()
            conns.push(conn)
            return conn
        })

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        await session.serve(openPacket('reverse:forward:tcp:9999;tcp:3000'))
        session.end()

        expect(conns[0].ended).toBe(1)
        expect(conns[1].ended).toBe(1)
    })
})

// Slice 5.4: once a forward is successfully bound, minirev starts sending us
// frames over the conn. Those must reach ReverseStreamManager.handlePacket, which
// then opens a reverse connection on the user's side by emitting an A_OPEN.
//
// The real MinirevReader is used here, not a reimplementation of it: FakeMinirev
// is a Duplex, and fromDevice() pushes raw bytes that flow through the actual
// Transform. setImmediate is needed because the pipe is async — the 'packet' event
// is not emitted synchronously from the push.
describe('ReverseSession.serve: routing minirev frames after a successful bind', () => {
    // End-to-end path: user binds a forward, then an app on the device connects to
    // the port. The frame from minirev must trigger an A_OPEN so the user's server
    // can create the connection on their machine.
    //
    // This is the first test that exercises the full path: bind -> frame -> A_OPEN.
    // If conn is piped into ForwardReader and handlePacket is wired correctly, we
    // should see an A_OPEN with the local spec from the forwards map (tcp:8080) and
    // a non-zero localId.
    it('opens a connection on the user side when minirev sends a frame after binding', async() => {
        const {reader} = fakeReader()
        const socket = fakeSocket(reader)
        const conns: FakeMinirev[] = []
        const session = new ReverseSession(socket as never, async() => {
            const conn = new FakeMinirev()
            conns.push(conn)
            return conn
        })

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        socket.writes.length = 0

        // Simulate minirev: an app on the device connected to port 7777 under connId 1.
        conns[0].fromDevice(framedBy(1, Buffer.from('GET / HTTP/1.1\r\n')))
        await new Promise<void>(r => setImmediate(r))

        // ForwardReader emitted ('packet', 1, data) -> manager.handlePacket(1, data)
        // -> resolveLocal('tcp:7777') === 'tcp:8080' -> A_OPEN with spec 'tcp:8080\0'.
        // The exact localId is not checked here (the counter consumed id=2 for the
        // command stream already); manager.test.ts covers that end-to-end.
        // What matters is that a packet went out and the spec is right.
        expect(socket.writes.length).toBeGreaterThan(0)
        // Bytes 0-23 are the fixed-length ADB message header; data starts at 24.
        expect(socket.writes[0].subarray(24).toString()).toBe('tcp:8080\0')
    })

    // Two forwards in one session: a frame on each conn must open a stream with
    // the *correct* local spec. Without this test, passing the wrong `remote` to
    // the manager constructor (e.g. command.local instead of command.remote) would
    // be invisible, because with only one forward both specs resolve to the same
    // forward and the wrong one just happens to match.
    it('routes a frame to the correct forward when two are bound', async() => {
        const {reader} = fakeReader()
        const socket = fakeSocket(reader)
        const conns: FakeMinirev[] = []
        const session = new ReverseSession(socket as never, async() => {
            const conn = new FakeMinirev()
            conns.push(conn)
            return conn
        })

        await session.serve(openPacket('reverse:forward:tcp:7777;tcp:8080'))
        await session.serve(openPacket('reverse:forward:tcp:9999;tcp:3000'))
        socket.writes.length = 0

        // A frame arrives on the *second* forward's conn (connId 5, arbitrary).
        conns[1].fromDevice(framedBy(5, Buffer.from('hello')))
        await new Promise<void>(r => setImmediate(r))

        // The A_OPEN must carry the second forward's local spec (tcp:3000), not the
        // first's. A mismatch here would send the user's client to the wrong port.
        expect(socket.writes.length).toBeGreaterThan(0)
        expect(socket.writes[0].subarray(24).toString()).toBe('tcp:3000\0')
    })
})
