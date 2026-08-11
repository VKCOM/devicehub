import {describe, it, expect} from 'vitest'
// Oracle: adbkit's own packet encoder. Our bytes land in the user's real adb
// server, so "identical to what a working ADB implementation emits" is the only
// specification worth asserting against. See packet.test.ts for why this is
// imported by file path and why the bare '@u4/adbkit' import must come first.
import '@u4/adbkit'
import AdbkitPacket from '../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/packet.js'
import {ReverseStream} from '../../../../../lib/units/device/plugins/adb-reverse/stream.ts'
import {A_OKAY, A_WRTE, A_CLSE} from '../../../../../lib/units/device/plugins/adb-reverse/packet.ts'

/** Stand-in for adbkit's tcpusb Socket: records what we would put on the wire. */
function fakeSocket() {
    const writes: Buffer[] = []
    return {
        maxPayload: 4096,
        writes,
        write(chunk: Buffer) {
            writes.push(chunk)
            return true
        },
    }
}

/**
 * Stand-in for the minirev connection to the device end of this reverse stream.
 * Only the sink half matters here; framing is the caller's job, not ours.
 */
function fakeDevice() {
    const writes: Buffer[] = []
    return {
        writes,
        ended: 0,
        write(chunk: Buffer) {
            writes.push(chunk)
            return true
        },
        end() {
            this.ended++
        },
    }
}

describe('ReverseStream: opening the stream', () => {
    // We are the initiator here, which is the mirror image of adbkit's Service.
    // arg0 carries our own id; arg1 MUST be 0 because we do not yet know the
    // user's id for this stream, and a non-zero arg1 would be read as a delayed
    // ack window the user's server never negotiated.
    it('asks the user for the local spec they registered, with no peer id yet', () => {
        const socket = fakeSocket()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', fakeDevice())

        stream.open()

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_OPEN, 7, 0, Buffer.from('tcp:8080\0')),
        ])
    })
})

describe('ReverseStream: device -> user', () => {
    // The user's A_OKAY is what tells us their id for this stream; every packet
    // we send afterwards must carry it as arg1, or their server routes it to no
    // socket at all. adbkit's Service reads the pair as (arg0=peer, arg1=ours),
    // so on the way back the ids swap: we send (arg0=ours, arg1=theirs).
    it('forwards a device chunk once the user has acknowledged the open', () => {
        const socket = fakeSocket()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', fakeDevice())
        stream.open()
        socket.writes.length = 0

        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})
        stream.fromDevice(Buffer.from('GET / HTTP/1.1\r\n'))

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 7, 31, Buffer.from('GET / HTTP/1.1\r\n')),
        ])
    })

    // Not an optimisation we invented: with delayed ack unnegotiated, AOSP's
    // sender stops reading its socket until the ack lands ("acks not deferred,
    // blocking", sockets.cpp:232-236). A second unacked A_WRTE is a protocol
    // violation, so the second chunk has to wait.
    it('holds a second chunk until the user acknowledges the first', () => {
        const socket = fakeSocket()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', fakeDevice())
        stream.open()
        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})
        socket.writes.length = 0

        stream.fromDevice(Buffer.from('first'))
        stream.fromDevice(Buffer.from('second'))

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 7, 31, Buffer.from('first')),
        ])
    })

    // ...and once it lands, the held bytes go out, still in order.
    it('releases the held chunk when the acknowledgement arrives', () => {
        const socket = fakeSocket()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', fakeDevice())
        stream.open()
        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})
        stream.fromDevice(Buffer.from('first'))
        stream.fromDevice(Buffer.from('second'))
        socket.writes.length = 0

        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 7, 31, Buffer.from('second')),
        ])
    })

    // The device can produce bytes before the user has accepted the open — the
    // TCP connection to minirev exists as soon as the app connects. Writing them
    // out then would mean arg1=0, and the user's server drops any A_WRTE with a
    // zero id without a word (adb.cpp:619), losing the bytes for good.
    it('does not write device bytes before the open is acknowledged', () => {
        const socket = fakeSocket()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', fakeDevice())
        stream.open()
        socket.writes.length = 0

        stream.fromDevice(Buffer.from('early'))

        expect(socket.writes).toEqual([])
    })

    // ...and they must not be dropped either: the same bytes go out, with the
    // real peer id, as soon as the open lands.
    it('delivers the early bytes once the open is acknowledged', () => {
        const socket = fakeSocket()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', fakeDevice())
        stream.open()
        stream.fromDevice(Buffer.from('early'))
        socket.writes.length = 0

        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})

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
        const socket = fakeSocket()
        const device = fakeDevice()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', device)
        stream.open()
        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})
        socket.writes.length = 0

        stream.handle({command: A_WRTE, arg0: 31, arg1: 7, data: Buffer.from('HTTP/1.1 200 OK')})

        expect(device.writes).toEqual([Buffer.from('HTTP/1.1 200 OK')])
        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_OKAY, 7, 31, undefined),
        ])
    })
})

describe('ReverseStream: closing the stream', () => {
    // The user's server only acts on a close whose arg1 names one of its own
    // sockets (adb.cpp:594 ignores the packet unless arg1 != 0), so the peer id
    // learned from their A_OKAY has to be echoed here too. Without this packet
    // their end of the connection leaks: nothing else tells them we are done.
    it('tells the user to close the stream it acknowledged', () => {
        const socket = fakeSocket()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', fakeDevice())
        stream.open()
        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})
        socket.writes.length = 0

        stream.end()

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 7, 31, undefined),
        ])
    })

    // A zero arg0 is the protocol's way of saying "that open never came up"
    // (adb.cpp:597 documents CLOSE(0, remote-id) as the failed-OPEN form, and
    // adbkit's Service does the same: `opened ? localId : 0`). We get here when
    // the user's port is not listening — Charles closed, mitmproxy not started —
    // so we never saw their A_OKAY and have no id of our own worth naming.
    it('reports a close before the open was acknowledged as a failed open', () => {
        const socket = fakeSocket()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', fakeDevice())
        stream.open()
        socket.writes.length = 0

        stream.end()

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 0, 0, undefined),
        ])
    })

    // The user hanging up is the normal way a reverse connection dies: their
    // browser closes the tab, or the port was never listening in the first place
    // (Charles not started), in which case their server answers our A_OPEN with
    // A_CLSE instead of A_OKAY. Either way the minirev connection on the device
    // has to go, or the app sits waiting on a socket nobody will ever answer.
    it('closes the device connection when the user closes the stream', () => {
        const socket = fakeSocket()
        const device = fakeDevice()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', device)
        stream.open()
        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})

        stream.handle({command: A_CLSE, arg0: 31, arg1: 7})

        expect(device.ended).toBe(1)
    })

    // AOSP echoes the close rather than staying silent: the incoming A_CLSE runs
    // local_socket_close, which calls peer->shutdown (sockets.cpp:352) — that is
    // remote_socket_shutdown (sockets.cpp:552), and it puts an A_CLSE on the wire.
    // adbkit's Service does the same by routing the packet into end(). It cannot
    // loop: by the time ours arrives their socket is gone, so find_local_socket
    // finds nothing and adb.cpp:594 drops it.
    it('echoes the close back to the user', () => {
        const socket = fakeSocket()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', fakeDevice())
        stream.open()
        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})
        socket.writes.length = 0

        stream.handle({command: A_CLSE, arg0: 31, arg1: 7})

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 7, 31, undefined),
        ])
    })

    // Closing twice is the normal case, not a corner case: the manager ends every
    // stream when the `adb connect` socket drops, and the user's own A_CLSE may
    // already have taken this one down. A second A_CLSE on the wire would name an
    // id their server has since handed to a different stream, closing it instead.
    // adbkit guards every handler with `if (this.ended) return`.
    it('closes only once, however many times it is asked', () => {
        const socket = fakeSocket()
        const device = fakeDevice()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', device)
        stream.open()
        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})
        socket.writes.length = 0

        stream.handle({command: A_CLSE, arg0: 31, arg1: 7})
        stream.end()

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 7, 31, undefined),
        ])
        expect(device.ended).toBe(1)
    })

    // The app on the device hanging up is the other normal end of a reverse
    // connection: it got its HTTP response and closed the socket. minirev reports
    // that as a frame with length 0, which ForwardReader turns into
    // ('packet', connId, null) (reader.js:28-31). Nothing else tells the user we
    // are done, so their end would leak exactly as it would on our own close.
    it('closes the user stream when the app on the device hangs up', () => {
        const socket = fakeSocket()
        const device = fakeDevice()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', device)
        stream.open()
        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})
        socket.writes.length = 0

        stream.fromDeviceEnd()

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 7, 31, undefined),
        ])
    })

    // AOSP defers a socket close when its packet queue is still non-empty:
    // local_socket_close adds it to local_socket_closing_list and only destroys
    // it in local_socket_flush_incoming once the queue drains (sockets.cpp:161).
    // In practice this is unreachable on a local device because AOSP stops reading
    // the fd while a write is unacked ("acks not deferred, blocking", sockets.cpp:232),
    // so it would never even see the EOF until then. But minirev multiplexes many
    // connections into one adb stream, so it cannot pause reading: we can receive a
    // FIN frame for connection A while A's A_WRTE is still unacknowledged.
    // Correct behaviour: flush ALL pending bytes first, then close.
    // Three chunks: first goes out immediately, second+third are queued. FIN arrives
    // while the queue is non-empty. The close must only fire after the LAST chunk
    // has been sent — not after the second (when the third is still waiting).
    it('sends all pending bytes before closing when the device hangs up mid-flight', () => {
        const socket = fakeSocket()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', fakeDevice())
        stream.open()
        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})
        // chunk1 goes out immediately; chunk2 and chunk3 queue up
        stream.fromDevice(Buffer.from('chunk1'))
        stream.fromDevice(Buffer.from('chunk2'))
        stream.fromDevice(Buffer.from('chunk3'))
        socket.writes.length = 0

        // FIN arrives while chunk2 and chunk3 are still in the pending queue
        stream.fromDeviceEnd()
        expect(socket.writes).toEqual([])  // close not sent yet

        // First ack: chunk2 goes out; chunk3 is still pending → no close yet
        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})
        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 7, 31, Buffer.from('chunk2')),
        ])

        socket.writes.length = 0

        // Second ack: chunk3 goes out, queue drained → close follows
        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})
        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 7, 31, Buffer.from('chunk3')),
            AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 7, 31, undefined),
        ])
    })

    // The ordinary shape of a request/response, and the case that must NOT wait:
    // the device sent its request, we forwarded it, and it hung up while our
    // A_WRTE was still unacknowledged. The queue is empty, so there is nothing
    // left to send and nothing left to wait for — the close goes out at once.
    //
    // Waiting for the ack here would be a deadlock disguised as caution: the
    // trigger to re-check would be an incoming A_OKAY that the user has no reason
    // to follow with anything, and the stream would sit open for the whole life of
    // the `adb connect` session. It is also not what a local device does: AOSP
    // defers only while there are packets left to write out (fd_full is
    // `!packet_queue.empty()`, sockets.cpp:160-163) — acks play no part in it.
    //
    // No bytes are at risk. The A_WRTE is already on the same TCP stream ahead of
    // the A_CLSE, and the user's own deferred close is what guarantees the rest:
    // it flushes its queue into the fd before destroying the socket (the RFC 1122
    // reasoning quoted at sockets.cpp:280-286).
    it('closes at once when the device hangs up with nothing left to send', () => {
        const socket = fakeSocket()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', fakeDevice())
        stream.open()
        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})
        // Goes out immediately, leaving the queue empty and the window taken.
        stream.fromDevice(Buffer.from('GET / HTTP/1.1\r\n'))
        socket.writes.length = 0

        stream.fromDeviceEnd()

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 7, 31, undefined),
        ])
    })

    // Packets already in flight when we close still arrive afterwards. Answering
    // one means putting our localId on the wire after we told them it was dead —
    // by then their server may have reissued that id, so the A_OKAY would credit
    // a write window on somebody else's stream. adbkit returns early from every
    // handler once ended, and the bytes have nowhere to go regardless: the device
    // connection is already gone.
    it('answers nothing that arrives after the close', () => {
        const socket = fakeSocket()
        const device = fakeDevice()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', device)
        stream.open()
        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})
        stream.end()
        socket.writes.length = 0

        stream.handle({command: A_WRTE, arg0: 31, arg1: 7, data: Buffer.from('late')})

        expect(socket.writes).toEqual([])
        expect(device.writes).toEqual([])
    })

    // The same hazard from the other direction: minirev can hand us a chunk that
    // was already in its buffer when the stream died. An A_WRTE under a retired
    // localId is worse than a stray A_OKAY, because it delivers our bytes into
    // whatever stream now owns that id.
    it('sends no device bytes that turn up after the close', () => {
        const socket = fakeSocket()
        const stream = new ReverseStream(socket, 7, 'tcp:8080', fakeDevice())
        stream.open()
        stream.handle({command: A_OKAY, arg0: 31, arg1: 7})
        stream.end()
        socket.writes.length = 0

        stream.fromDevice(Buffer.from('late'))

        expect(socket.writes).toEqual([])
    })
})
