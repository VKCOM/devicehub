import {describe, it, expect} from 'vitest'
// Oracles: adbkit's own packet encoder, plus the very ServiceMap and
// RollingCounter instances a real tcpusb Socket owns. Our reverse streams share
// both with the user's client streams, so faking them would hide exactly the
// collisions we care about.
//
// Imported by file path because @u4/adbkit declares only "." in its package
// exports; the bare '@u4/adbkit' import must stay first to break the dist import
// cycle. See packet.test.ts for the full explanation. Do not reorder.
import '@u4/adbkit'
import AdbkitPacket from '../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/packet.js'
import ServiceMap from '../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/servicemap.js'
import RollingCounter from '../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/rollingcounter.js'
import {ReverseStreamManager} from '../../../../../lib/units/device/plugins/adb-reverse/manager.ts'
import {ReverseForwards} from '../../../../../lib/units/device/plugins/adb-reverse/forwards.ts'
import {MinirevWriter} from '../../../../../lib/units/device/plugins/adb-reverse/minirevWriter.ts'

/**
 * Stand-in for adbkit's tcpusb Socket, using its real id counter and service
 * map: those are the two pieces of socket state we share with client streams.
 */
function fakeSocket() {
    const writes: Buffer[] = []
    return {
        maxPayload: 4096,
        writes,
        remoteId: new RollingCounter(0xffffffff),
        services: new ServiceMap(),
        write(chunk: Buffer) {
            writes.push(chunk)
            return true
        },
    }
}

/** Stand-in for the minirev stream: records the frames we put on it. */
function fakeConn() {
    const writes: Buffer[] = []
    return {
        writes,
        ended: 0,
        /** How many frames had been written when the stream was ended. */
        writesWhenEnded: -1,
        write(chunk: Buffer) {
            writes.push(chunk)
            return true
        },
        end() {
            this.ended += 1
            this.writesWhenEnded = writes.length
        },
    }
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

/** A forwards map with one live binding, as `adb reverse tcp:7777 tcp:8080` leaves it. */
function boundForwards() {
    const forwards = new ReverseForwards()
    forwards.exec('reverse:forward:tcp:7777;tcp:8080')
    return forwards
}

describe('ReverseStreamManager: a new connection on the device', () => {
    // The app on the device connected to the listening port, and minirev told us
    // by sending a frame under a connId we have not seen. That is our cue to ask
    // the user's server to connect on their side.
    //
    // The spec comes from the forwards map, never from the device: the user's
    // server LOG(FATAL)s on an A_OPEN whose service name it has not snooped
    // (adb.cpp:500, transport.cpp:1680), which kills their adb outright.
    //
    // The id must come from the socket's own RollingCounter, shared with client
    // streams — a private counter would eventually hand out an id that already
    // names one of their streams. Its first value is 2, and never 0, which is
    // what keeps arg0 non-zero (create_remote_socket LOG(FATAL)s on id 0,
    // sockets.cpp:544).
    it('asks the user to connect to the spec registered for this forward', () => {
        const socket = fakeSocket()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards(), fakeConn())

        manager.handlePacket(1, Buffer.from('GET / HTTP/1.1\r\n'))

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_OPEN, 2, 0, Buffer.from('tcp:8080\0')),
        ])
    })

    // Registration in the socket's ServiceMap is the only thing that makes the
    // stream reachable: adbkit routes every incoming A_OKAY/A_WRTE/A_CLSE through
    // `this.services.get(packet.arg1)` (socket.js:240-243) and silently discards
    // the packet when nothing is registered. So without this the user's A_OKAY
    // never arrives, and the stream stays stuck with a zero peer id forever.
    //
    // Asserted the way adbkit reaches it, not by inspecting our own map: the
    // whole point is that *their* lookup finds our handler.
    it('registers the stream where adbkit routes incoming packets', () => {
        const socket = fakeSocket()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards(), fakeConn())
        manager.handlePacket(1, Buffer.from('GET / HTTP/1.1\r\n'))
        socket.writes.length = 0

        // The user's server accepted the open and gave the stream its own id 31.
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})

        // Arrival is observable: the queued request bytes are released, now that
        // the peer id is known.
        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 2, 31, Buffer.from('GET / HTTP/1.1\r\n')),
        ])
    })

    // minirev's connId is the connection's identity, and it stays the same for
    // every frame of it — a large request body arrives as several frames
    // (MAX_PACKET_SIZE is 0xFFFF, reader.js splits on it). Opening a second
    // stream for the second frame would give the user two TCP connections for
    // one, split the request between them, and leak the first.
    it('keeps one user stream per device connection, however many frames arrive', () => {
        const socket = fakeSocket()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards(), fakeConn())
        manager.handlePacket(1, Buffer.from('POST /upload HTTP/1.1\r\n'))
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})

        manager.handlePacket(1, Buffer.from('body'))
        // The first chunk is still unacknowledged, so the body waits its turn;
        // this ack is what releases it.
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})

        // Nothing is cleared here on purpose: the whole exchange must contain
        // exactly one A_OPEN, and both chunks must ride the same pair of ids.
        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_OPEN, 2, 0, Buffer.from('tcp:8080\0')),
            AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 2, 31, Buffer.from('POST /upload HTTP/1.1\r\n')),
            AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 2, 31, Buffer.from('body')),
        ])
    })
})

describe('ReverseStreamManager: user → device framing', () => {
    // Bytes that arrive from the user in an A_WRTE must reach the app on the
    // device exactly as they would from a locally connected device. minirev frames
    // them as [uint16LE connId][uint16LE length][payload] — the same framing the
    // forward path uses for the other direction. We use the forward plugin's own
    // ForwardWriter as the oracle rather than reproducing the layout from memory:
    // minirev is a vendored binary and ForwardWriter is already talking to it.
    it('frames user bytes with the minirev connId before writing to the device connection', () => {
        const socket = fakeSocket()
        const conn = fakeConn()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards(), conn)

        // Open a connection and acknowledge it.
        manager.handlePacket(1, Buffer.from('ignored-first-chunk'))
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})

        // Now the user sends a response.
        socket.services.get(2).handle({
            command: AdbkitPacket.A_WRTE,
            arg0: 31,
            arg1: 2,
            data: Buffer.from('HTTP/1.1 200 OK\r\n'),
        })

        // The bytes must reach the device connection framed with the connId.
        expect(conn.writes).toEqual([framedBy(1, Buffer.from('HTTP/1.1 200 OK\r\n'))])
    })
})

describe('ReverseStreamManager: cleanup when a stream closes', () => {
    // adbkit's RollingCounter will eventually wrap around (max is 0xffffffff but
    // it is still finite). When it reissues a localId that is still in ServiceMap,
    // ServiceMap.insert throws — crashing packet handling for every subsequent
    // stream. And this.streams never shrinking means one stale ReverseStream entry
    // per completed request for the whole life of the `adb connect` session.
    // The fix: remove both entries as soon as the stream closes, regardless of
    // which side closed it.
    it('removes the stream from services when the user closes it', () => {
        const socket = fakeSocket()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards(), fakeConn())
        manager.handlePacket(1, Buffer.from('GET / HTTP/1.1\r\n'))
        // The first localId the counter hands out is 2.
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})

        socket.services.get(2).handle({command: AdbkitPacket.A_CLSE, arg0: 31, arg1: 2})

        expect(socket.services.get(2)).toBeNull()
    })

    // The same cleanup is owed when the *device* hangs up: the stream closes from
    // the inside, without any packet from the user passing through the manager.
    // Slice 3 made that path defer the close until the queue drains, so the
    // notification has to come from the stream itself rather than from wherever
    // the manager happens to be in its own control flow.
    it('removes the stream from services when the device hangs up', () => {
        const socket = fakeSocket()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards(), fakeConn())
        manager.handlePacket(1, Buffer.from('GET / HTTP/1.1\r\n'))
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})

        manager.handlePacket(1, null)

        expect(socket.services.get(2)).toBeNull()
    })

    // minirev reuses connIds, so the next connection to the device port may well
    // arrive under a connId we have already served. A closed stream left in the
    // manager's own map would swallow it: the frame would be pushed into a dead
    // stream (whose `ended` guard drops everything) and the user would never be
    // asked to connect. Observable as the second A_OPEN, under a fresh localId.
    it('opens a new stream when minirev reuses the connId of a closed connection', () => {
        const socket = fakeSocket()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards(), fakeConn())
        manager.handlePacket(1, Buffer.from('first'))
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})
        socket.services.get(2).handle({command: AdbkitPacket.A_CLSE, arg0: 31, arg1: 2})
        socket.writes.length = 0

        manager.handlePacket(1, Buffer.from('second'))

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_OPEN, 3, 0, Buffer.from('tcp:8080\0')),
        ])
    })
})

describe('ReverseStreamManager: telling the device a connection is over', () => {
    // The user closed their end. The app on the device is still holding its socket
    // open, waiting on a connection nobody serves any more; minirev only learns
    // otherwise from a zero-length frame (writer.js:24-30 writes it, reader.js:28-31
    // reads it). Without this the app hangs until its own timeout.
    it('sends a minirev FIN frame for the connection the user closed', () => {
        const socket = fakeSocket()
        const conn = fakeConn()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards(), conn)
        manager.handlePacket(1, Buffer.from('GET / HTTP/1.1\r\n'))
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})

        socket.services.get(2).handle({command: AdbkitPacket.A_CLSE, arg0: 31, arg1: 2})

        expect(conn.writes).toEqual([finFramedBy(1)])
    })

    // The FIN has to name the connection, so two live connections do not take each
    // other down: a frame with the wrong connId would close a stranger's socket on
    // the device. Two connections at once is also the normal case — a browser on
    // the device opens several.
    it('names the connection that closed, leaving the other one alone', () => {
        const socket = fakeSocket()
        const conn = fakeConn()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards(), conn)
        manager.handlePacket(1, Buffer.from('first'))
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})
        manager.handlePacket(7, Buffer.from('second'))
        socket.services.get(3).handle({command: AdbkitPacket.A_OKAY, arg0: 32, arg1: 3})

        socket.services.get(3).handle({command: AdbkitPacket.A_CLSE, arg0: 32, arg1: 3})

        expect(conn.writes).toEqual([finFramedBy(7)])
    })

    // The minirev stream is shared by every connection on this forward — it is the
    // one adb stream all of them are multiplexed into. Ending it to signal that a
    // single connection finished would take down all the others, and the device
    // would stop accepting new ones entirely.
    it('keeps the shared minirev stream open when one connection ends', () => {
        const socket = fakeSocket()
        const conn = fakeConn()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards(), conn)
        manager.handlePacket(1, Buffer.from('GET / HTTP/1.1\r\n'))
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})

        socket.services.get(2).handle({command: AdbkitPacket.A_CLSE, arg0: 31, arg1: 2})

        expect(conn.ended).toBe(0)
    })
})

describe('ReverseStreamManager: the forward itself goes away', () => {
    // The binding is gone — `adb reverse --remove`, the `adb connect` session
    // dropped, or the device left the group. Every connection multiplexed into it
    // has to be closed, not just the last one: an unclosed stream leaves a socket
    // open on the user's machine with nothing on our side serving it, and their
    // server has no way to learn the binding is over.
    //
    // Two connections at once is the case that matters. With one, a close loop
    // that stops after the first stream looks perfectly correct.
    it('closes every open connection when the forward is torn down', () => {
        const socket = fakeSocket()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards(), fakeConn())
        manager.handlePacket(1, Buffer.from('first'))
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})
        manager.handlePacket(7, Buffer.from('second'))
        socket.services.get(3).handle({command: AdbkitPacket.A_OKAY, arg0: 32, arg1: 3})
        socket.writes.length = 0

        manager.end()

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 2, 31, undefined),
            AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 3, 32, undefined),
        ])
    })

    // The minirev stream *is* the binding: closing it is what makes the device stop
    // listening on the port. The forward plugin's own teardown is exactly this —
    // `ForwardHandler.end = conn.end()` (forward/util/manager.js:85-87), which is
    // what `plugin.removeForward` relies on. That it is the only unbind mechanism
    // is visible in `manager.add`: rebinding the same devicePort first calls
    // `this.remove(handlerId)` (manager.js:105-110) to drop the old stream.
    // Leave it open and the device keeps accepting connections for a forward the
    // user has already removed, and we would answer them with an A_OPEN the user's
    // server no longer has snooped — LOG(FATAL), their adb dies (adb.cpp:500).
    //
    // Ordering matters as much as the call: each stream writes its FIN frame into
    // this same conn, so the streams have to close while it is still open.
    it('closes the shared minirev stream once the connections have said goodbye', () => {
        const socket = fakeSocket()
        const conn = fakeConn()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards(), conn)
        manager.handlePacket(1, Buffer.from('first'))
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})
        manager.handlePacket(7, Buffer.from('second'))
        socket.services.get(3).handle({command: AdbkitPacket.A_OKAY, arg0: 32, arg1: 3})

        manager.end()

        expect(conn.ended).toBe(1)
        // Both FIN frames were already on the stream when it was ended, so the
        // device sees each connection finish rather than the stream vanishing
        // under it.
        expect(conn.writes).toEqual([finFramedBy(1), finFramedBy(7)])
        expect(conn.writesWhenEnded).toBe(2)
    })

    // A frame can still arrive after the teardown. `conn.end()` closes only the
    // writable half — the stream was created with allowHalfOpen and ForwardReader
    // sits on the readable half, so whatever minirev had already sent is still
    // delivered as ('packet', ...) afterwards.
    //
    // Serving it would be the one thing we must never do. When the teardown came
    // from `adb reverse --remove`, the user's server has already dropped the
    // binding from reverse_forwards_, and an A_OPEN for a spec it no longer has
    // snooped is answered with LOG(FATAL) — their adb process dies
    // (adb.cpp:500, transport.cpp:1680). Registering the stream would leak an
    // entry in the socket's ServiceMap too, for a forward that no longer exists.
    it('ignores a late frame from minirev after the forward is gone', () => {
        const socket = fakeSocket()
        const conn = fakeConn()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards(), conn)
        manager.end()
        socket.writes.length = 0

        manager.handlePacket(4, Buffer.from('too late'))

        expect(socket.writes).toEqual([])
        // Nothing was registered under the id the counter would have handed out.
        expect(socket.services.get(2)).toBeNull()
    })
})

describe('ReverseStreamManager: the device connection closes', () => {
    // The app on the device got its response and hung up. minirev reports that as
    // a zero-length frame, which ForwardReader turns into ('packet', connId, null)
    // (reader.js:28-31). Routing it as a data packet instead would leave the user's
    // socket open forever, holding a connection nothing will ever answer — and a
    // long-lived `adb connect` session leaks one per request.
    it('closes the user stream when minirev reports the connection finished', () => {
        const socket = fakeSocket()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards(), fakeConn())
        manager.handlePacket(1, Buffer.from('GET / HTTP/1.1\r\n'))
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})
        socket.writes.length = 0

        manager.handlePacket(1, null)

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 2, 31, undefined),
        ])
    })
})
