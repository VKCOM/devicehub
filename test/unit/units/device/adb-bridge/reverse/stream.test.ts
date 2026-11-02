import {describe, it, expect, afterEach} from 'vitest'
import {Duplex} from 'node:stream'
import net from 'node:net'
import {once} from 'node:events'
// Oracle: adbkit's own packet encoder. Our bytes land in the user's real adb
// server, so "identical to what a working ADB implementation emits" is the only
// specification worth asserting against. See packet.test.ts for why this is
// imported by file path and why the bare '@u4/adbkit' import must come first.
import '@u4/adbkit'
import AdbkitPacket from '../../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/packet.js'
import {ReverseStream} from '../../../../../../lib/units/device/plugins/adb-bridge/reverse/stream.ts'
import {A_OKAY, A_WRTE, A_CLSE} from '../../../../../../lib/units/device/plugins/adb-bridge/packet.ts'
import {ackPayload, RECEIVE_WINDOW} from '../../../../../../lib/units/device/plugins/adb-bridge/flow.ts'

/** Stand-in for the bridge connection: records what we would put on the wire. */
function fakeSocket(maxPayload = 4096) {
    const writes: Buffer[] = []
    const payloads: Array<Buffer | undefined> = []
    return {
        maxPayload,
        writes,
        payloads,
        // Encoded by adbkit, the oracle for what goes on the wire
        send(command: number, arg0: number, arg1: number, data?: Buffer) {
            writes.push(AdbkitPacket.assemble(command, arg0, arg1, data))
            payloads.push(data)
        },
    }
}

/**
 * Stand-in for the device end: the adb stream the helper attached to the app's
 * socket. What the app sends is `appSends`, what reached the app is `received`.
 * `full` makes writes report backpressure and hold their callback until `drainNow`.
 */
class FakeDevice extends Duplex {
    received: Buffer[] = []
    full = false
    private held: Array<() => void> = []

    constructor() {
        super({writableHighWaterMark: 1})
    }

    _read() {}

    _write(chunk: Buffer, _encoding: string, callback: () => void) {
        this.received.push(Buffer.from(chunk))
        if (this.full) {
            this.held.push(callback)
            return
        }
        callback()
    }

    appSends(data: string | Buffer) {
        this.push(typeof data === 'string' ? Buffer.from(data) : data)
    }

    appHangsUp() {
        this.push(null)
    }

    drainNow() {
        this.full = false
        this.held.splice(0).forEach(callback => callback())
    }
}

/** The socket's 'readable' and 'end' are emitted on a later tick */
const settle = () => new Promise<void>(resolve => setImmediate(resolve))

const okay = {command: A_OKAY, arg0: 31, arg1: 7}
const wrte = (data: string) => ({command: A_WRTE, arg0: 31, arg1: 7, data: Buffer.from(data)})
const clse = {command: A_CLSE, arg0: 31, arg1: 7}

function opened(maxPayload?: number) {
    const socket = fakeSocket(maxPayload)
    const device = new FakeDevice()
    const stream = new ReverseStream(socket, 7, 'tcp:8080', device)
    stream.open()
    stream.handle(okay)
    socket.writes.length = 0
    socket.payloads.length = 0
    return {socket, device, stream}
}

describe('ReverseStream: opening the stream', () => {
    // We are the initiator here, which is the mirror image of DeviceService.
    // arg0 carries our own id; arg1 MUST be 0 because we do not yet know the
    // user's id for this stream, and a non-zero arg1 would be read as a delayed
    // ack window the user's server never negotiated.
    it('asks the user for the local spec they registered, with no peer id yet', () => {
        const socket = fakeSocket()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', new FakeDevice())

        stream.open()

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_OPEN, 7, 0, Buffer.from('tcp:8080\0')),
        ])
    })
})

describe('ReverseStream: device -> user', () => {
    // The user's A_OKAY is what tells us their id for this stream; every packet
    // we send afterwards must carry it as arg1, or their server routes it to no
    // socket at all. So the ids swap on the way back: (arg0=ours, arg1=theirs).
    it('forwards a device chunk once the user has acknowledged the open', async() => {
        const {socket, device} = opened()

        device.appSends('GET / HTTP/1.1\r\n')
        await settle()

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 7, 31, Buffer.from('GET / HTTP/1.1\r\n')),
        ])
    })

    // Not an optimisation we invented: with delayed ack unnegotiated, AOSP's
    // sender stops reading its socket until the ack lands ("acks not deferred,
    // blocking", sockets.cpp:232-236). A second unacked A_WRTE is a protocol
    // violation, so the second chunk has to wait.
    it('holds a second chunk until the user acknowledges the first', async() => {
        const {socket, device} = opened()

        device.appSends('first')
        await settle()
        device.appSends('second')
        await settle()

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 7, 31, Buffer.from('first')),
        ])
    })

    // ...and once it lands, the held bytes go out, still in order.
    it('releases the held chunk when the acknowledgement arrives', async() => {
        const {socket, device, stream} = opened()
        device.appSends('first')
        await settle()
        device.appSends('second')
        await settle()
        socket.writes.length = 0

        stream.handle(okay)

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 7, 31, Buffer.from('second')),
        ])
    })

    // The app can send before the user has accepted the open: the connection
    // exists as soon as it connects. Writing those bytes out then would mean
    // arg1=0, and the user's server drops any A_WRTE with a zero id without a
    // word (adb.cpp:619), losing them for good.
    it('does not write device bytes before the open is acknowledged', async() => {
        const socket = fakeSocket()
        const device = new FakeDevice()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', device)
        stream.open()
        socket.writes.length = 0

        device.appSends('early')
        await settle()

        expect(socket.writes).toEqual([])
    })

    // ...and they must not be dropped either: the same bytes go out, with the
    // real peer id, as soon as the open lands.
    it('delivers the early bytes once the open is acknowledged', async() => {
        const socket = fakeSocket()
        const device = new FakeDevice()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', device)
        stream.open()
        device.appSends('early')
        await settle()
        socket.writes.length = 0

        stream.handle(okay)

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 7, 31, Buffer.from('early')),
        ])
    })
})

describe('ReverseStream: user -> device', () => {
    // The acknowledgement is not optional bookkeeping: the user's server stops
    // reading its socket after an unacked write (sockets.cpp:232), so a missing
    // A_OKAY stalls the response body forever. It must carry no payload at all —
    // a 4-byte one would be read as a delayed-ack credit, and any other size is
    // rejected outright ("invalid A_OKAY payload size", adb.cpp:568).
    it('passes the user response to the device and acknowledges it', () => {
        const {socket, device, stream} = opened()

        stream.handle(wrte('HTTP/1.1 200 OK'))

        expect(device.received).toEqual([Buffer.from('HTTP/1.1 200 OK')])
        expect(socket.writes).toEqual([AdbkitPacket.assemble(AdbkitPacket.A_OKAY, 7, 31, undefined)])
    })

    // The user only learns our id from their own A_OKAY, so a write before it
    // cannot be theirs; nothing must reach the app or be acknowledged.
    it('ignores a write that arrives before the open was acknowledged', () => {
        const socket = fakeSocket()
        const device = new FakeDevice()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', device)
        stream.open()
        socket.writes.length = 0

        stream.handle(wrte('stray'))

        expect(device.received).toEqual([])
        expect(socket.writes).toEqual([])
    })
})

describe('ReverseStream: closing the stream', () => {
    // The user's server only acts on a close whose arg1 names one of its own
    // sockets (adb.cpp:594 ignores the packet unless arg1 != 0), so the peer id
    // learned from their A_OKAY has to be echoed here too. Without this packet
    // their end of the connection leaks: nothing else tells them we are done.
    it('tells the user to close the stream it acknowledged', () => {
        const {socket, stream} = opened()

        stream.end()

        expect(socket.writes).toEqual([AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 7, 31, undefined)])
    })

    // A zero arg0 is the protocol's way of saying "that open never came up"
    // (adb.cpp:597 documents CLOSE(0, remote-id) as the failed-OPEN form, and
    // adbkit's Service does the same: `opened ? localId : 0`).
    it('reports a close before the open was acknowledged as a failed open', () => {
        const socket = fakeSocket()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', new FakeDevice())
        stream.open()
        socket.writes.length = 0

        stream.end()

        expect(socket.writes).toEqual([AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 0, 0, undefined)])
    })

    // The user hanging up is the normal way a reverse connection dies: their
    // browser closes the tab, or the port was never listening in the first place
    // (Charles not started), in which case their server answers our A_OPEN with
    // A_CLSE instead of A_OKAY. Either way the app's connection has to go, or it
    // sits waiting on a socket nobody will ever answer.
    it('closes the device connection when the user closes the stream', async() => {
        const {device, stream} = opened()

        stream.handle(clse)
        await settle()

        expect(device.destroyed).toBe(true)
    })

    // ...after what the user already wrote has reached the app: release() ends
    // before it destroys, so a response followed at once by a close arrives whole.
    it('delivers the user writes before it hangs up the device', async() => {
        const {device, stream} = opened()

        stream.handle(wrte('response'))
        stream.handle(clse)
        await settle()

        expect(Buffer.concat(device.received).toString()).toBe('response')
        expect(device.writableEnded).toBe(true)
    })

    // AOSP echoes the close rather than staying silent: the incoming A_CLSE runs
    // local_socket_close, which calls peer->shutdown (sockets.cpp:352) — that is
    // remote_socket_shutdown (sockets.cpp:552), and it puts an A_CLSE on the wire.
    // It cannot loop: by the time ours arrives their socket is gone, so
    // find_local_socket finds nothing and adb.cpp:594 drops it.
    it('echoes the close back to the user', () => {
        const {socket, stream} = opened()

        stream.handle(clse)

        expect(socket.writes).toEqual([AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 7, 31, undefined)])
    })

    // Closing twice is the normal case, not a corner case: the manager ends every
    // stream when the `adb connect` socket drops, and the user's own A_CLSE may
    // already have taken this one down. A second A_CLSE on the wire would name an
    // id their server has since handed to a different stream, closing it instead.
    it('closes only once, however many times it is asked', async() => {
        const {socket, device, stream} = opened()

        stream.handle(clse)
        stream.end()
        device.appHangsUp()
        await settle()

        expect(socket.writes).toEqual([AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 7, 31, undefined)])
    })

    // The app on the device hanging up is the other normal end of a reverse
    // connection: it got its response and closed the socket. Nothing else tells
    // the user we are done, so their end would leak as it would on our own close.
    it('closes the user stream when the app on the device hangs up', async() => {
        const {socket, device} = opened()

        device.appHangsUp()
        await settle()

        expect(socket.writes).toEqual([AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 7, 31, undefined)])
    })

    // AOSP defers a socket close while its packet queue is non-empty:
    // local_socket_close adds it to local_socket_closing_list and only destroys
    // it in local_socket_flush_incoming once the queue drains (sockets.cpp:161).
    // Here the queue is the socket's own buffer: the app sent more than one
    // packet and hung up while the first was unacknowledged. Everything must go
    // out first, the close only after the last byte.
    it('sends all pending bytes before closing when the device hangs up mid-flight', async() => {
        const {socket, device, stream} = opened()
        // A full packet each, so they cannot be merged and the buffer outlives an ack
        const [chunk1, chunk2, chunk3] = ['a', 'b', 'c'].map(fill => Buffer.alloc(socket.maxPayload, fill))
        device.appSends(Buffer.concat([chunk1, chunk2, chunk3]))
        device.appHangsUp()
        await settle()

        expect(socket.writes).toEqual([AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 7, 31, chunk1)])

        socket.writes.length = 0
        stream.handle(okay)
        await settle()
        expect(socket.writes).toEqual([AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 7, 31, chunk2)])

        socket.writes.length = 0
        stream.handle(okay)
        await settle()
        expect(socket.writes).toEqual([AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 7, 31, chunk3)])

        // The end is read like the data, once the last write is acknowledged
        socket.writes.length = 0
        stream.handle(okay)
        await settle()
        expect(socket.writes).toEqual([AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 7, 31, undefined)])
    })

    // The ordinary shape of a request/response: the app sent its request, we
    // forwarded it, and it hung up while our A_WRTE was still unacknowledged.
    // The close follows the ack, as on a device: adbd does not read the fd while
    // a write is unacked ("acks not deferred, blocking", sockets.cpp:232), so it
    // sees the EOF only then. It cannot hang there — the user's server
    // acknowledges every write once it has handed it to its socket.
    it('closes once the last write is acknowledged when the device hangs up', async() => {
        const {socket, device, stream} = opened()
        device.appSends('GET / HTTP/1.1\r\n')
        await settle()
        socket.writes.length = 0

        device.appHangsUp()
        await settle()
        expect(socket.writes).toEqual([])

        stream.handle(okay)
        await settle()
        expect(socket.writes).toEqual([AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 7, 31, undefined)])
    })

    // With nothing in flight the close goes out as soon as the app hangs up.
    it('closes at once when the device hangs up with nothing in flight', async() => {
        const {socket, device, stream} = opened()
        device.appSends('GET / HTTP/1.1\r\n')
        await settle()
        stream.handle(okay)
        socket.writes.length = 0

        device.appHangsUp()
        await settle()

        expect(socket.writes).toEqual([AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 7, 31, undefined)])
    })

    // An app that connects and gives up before the user has accepted the open.
    // A close now could not name their id, and their server drops one without it
    // (adb.cpp:594) — their end, already connected to their local service, would
    // stay open for the whole `adb connect` session. So it waits for the answer.
    it('closes with the user id when the app hangs up before the open was acknowledged', async() => {
        const socket = fakeSocket()
        const device = new FakeDevice()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', device)
        stream.open()
        socket.writes.length = 0

        device.appHangsUp()
        await settle()
        expect(socket.writes).toEqual([])

        stream.handle(okay)
        expect(socket.writes).toEqual([AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 7, 31, undefined)])
    })

    // Packets already in flight when we close still arrive afterwards. Answering
    // one means putting our localId on the wire after we told them it was dead —
    // by then their server may have reissued that id, so the A_OKAY would credit
    // a write window on somebody else's stream.
    it('answers nothing that arrives after the close', () => {
        const {socket, device, stream} = opened()
        stream.end()
        socket.writes.length = 0

        stream.handle(wrte('late'))

        expect(socket.writes).toEqual([])
        expect(device.received).toEqual([])
    })

    // The same hazard from the other direction: bytes the app sent just before
    // the close. An A_WRTE under a retired localId would deliver them into
    // whatever stream now owns that id.
    it('sends no device bytes that turn up after the close', async() => {
        const {socket, device, stream} = opened()
        stream.end()
        socket.writes.length = 0

        device.appSends('late')
        await settle()

        expect(socket.writes).toEqual([])
    })
})

describe('ReverseStream: throughput and flow control', () => {
    // Each A_WRTE costs the user a round trip, so an app's small writes that
    // pile up behind one in flight must go out together, not one per round trip.
    it('merges small queued writes into one packet', async() => {
        const {socket, device, stream} = opened()
        device.appSends('first')
        await settle()
        for (const word of ['a', 'b', 'c']) {
            device.appSends(word)
        }
        await settle()
        socket.writes.length = 0

        stream.handle(okay)

        expect(socket.writes).toEqual([AdbkitPacket.assemble(A_WRTE, 7, 31, Buffer.from('abc'))])
    })

    it('fills a packet up to maxPayload and keeps the rest in order', async() => {
        const {socket, device, stream} = opened()
        device.appSends('x')
        await settle()
        const big = Buffer.alloc(socket.maxPayload, 'b')
        device.appSends('aa')
        device.appSends(big)
        await settle()
        socket.writes.length = 0

        stream.handle(okay)
        stream.handle(okay)

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(A_WRTE, 7, 31, Buffer.concat([Buffer.from('aa'), big.subarray(0, socket.maxPayload - 2)])),
            AdbkitPacket.assemble(A_WRTE, 7, 31, big.subarray(0, 2)),
        ])
    })

    // The bytes the socket read are the bytes that go on the wire: the bridge
    // connection writes header and payload with one writev, so a copy here
    // would be the only one on the path.
    it('hands a chunk that fits to the connection without copying it', async() => {
        const {socket, device} = opened()
        const chunk = Buffer.from('payload')

        device.appSends(chunk)
        await settle()

        expect(socket.payloads[0]).toBe(chunk)
    })

    // Holding the ack is what stops a fast sender: the user's server sends
    // nothing more on this stream until it lands. As in AOSP (sockets.cpp:150-156)
    // it is held only while more than the latest write is still queued.
    it('acknowledges a write only once the one before it reached the device', async() => {
        const {socket, device, stream} = opened()
        device.full = true

        stream.handle(wrte('big'))
        stream.handle(wrte('bigger'))
        await settle()
        expect(socket.writes).toEqual([AdbkitPacket.assemble(A_OKAY, 7, 31)])

        device.drainNow()
        await settle()
        expect(socket.writes).toEqual([AdbkitPacket.assemble(A_OKAY, 7, 31), AdbkitPacket.assemble(A_OKAY, 7, 31)])
    })

    it('does not acknowledge after closing while waiting for the device', async() => {
        const {socket, device, stream} = opened()
        device.full = true

        stream.handle(wrte('big'))
        stream.handle(wrte('bigger'))
        stream.end()
        socket.writes.length = 0
        device.drainNow()
        await settle()

        expect(socket.writes).toEqual([])
    })
})

describe('ReverseStream: backpressure on a real socket', () => {
    const closing: Array<() => void> = []
    afterEach(() => closing.splice(0).forEach(close => close()))

    // While the user has not acknowledged, the device socket is not read beyond
    // its own buffer: the rest stays in the kernel and the sender is held back,
    // instead of the app's whole output piling up in the worker.
    it('stops reading the device while the user is behind', async() => {
        const server = net.createServer()
        server.listen(0, '127.0.0.1')
        await once(server, 'listening')
        const app = net.connect((server.address() as net.AddressInfo).port, '127.0.0.1')
        const [device] = await once(server, 'connection') as [net.Socket]
        closing.push(() => { app.destroy(); device.destroy(); server.close() })

        const socket = fakeSocket(65536)
        const stream = new ReverseStream(socket, 7, 'tcp:8080', device)
        stream.open()
        stream.handle(okay)

        const sent = 64 * 1024 * 1024
        app.write(Buffer.alloc(sent))
        await new Promise(resolve => setTimeout(resolve, 200))

        // One packet out, unacknowledged; the socket holds at most its high
        // water mark and a read's worth beyond it
        expect(socket.payloads.length).toBe(2)
        expect(device.readableLength).toBeLessThanOrEqual(256 * 1024)
        // ...and the app is held back: most of what it wrote has not left it
        expect(app.writableLength).toBeGreaterThan(sent / 2)

        // Acknowledging lets it move on
        stream.handle(okay)
        await settle()
        expect(socket.payloads.length).toBe(3)
    })
})

describe('ReverseStream: delayed ack', () => {
    function delayedSocket() {
        return Object.assign(fakeSocket(4), {delayedAck: true})
    }

    // adb.cpp:506-511: the user's server refuses an A_OPEN whose arg1 does not
    // match the mode; under delayed ack it is what they may send us
    it('offers its window in the A_OPEN', () => {
        const socket = delayedSocket()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', new FakeDevice())

        stream.open()

        expect(socket.writes).toEqual([AdbkitPacket.assemble(AdbkitPacket.A_OPEN, 7, RECEIVE_WINDOW, Buffer.from('tcp:8080\0'))])
    })

    // ...and their answer carries what we may send them (adb.cpp:539-544)
    it('sends up to the grant in the answer to its open without waiting', async() => {
        const socket = delayedSocket()
        const device = new FakeDevice()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', device)
        stream.open()
        stream.handle({...okay, data: ackPayload(8)})
        socket.writes.length = 0

        device.appSends('abcdefghijkl')
        await settle()

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(A_WRTE, 7, 31, Buffer.from('abcd')),
            AdbkitPacket.assemble(A_WRTE, 7, 31, Buffer.from('efgh')),
        ])
    })

    it('credits back what reached the device', async() => {
        const socket = delayedSocket()
        const device = new FakeDevice()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', device)
        stream.open()
        stream.handle({...okay, data: ackPayload(8)})
        socket.writes.length = 0

        stream.handle(wrte('reply'))
        await settle()

        expect(socket.writes).toEqual([AdbkitPacket.assemble(A_OKAY, 7, 31, ackPayload(5))])
    })
})
