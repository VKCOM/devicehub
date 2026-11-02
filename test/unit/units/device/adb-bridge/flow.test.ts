import {describe, it, expect, vi} from 'vitest'
import {Duplex} from 'node:stream'
// Oracle: adbkit's own packet encoder. The bare '@u4/adbkit' import must stay
// first to break the dist import cycle; see packet.test.ts.
import '@u4/adbkit'
import AdbkitPacket from '../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/packet.js'
import {StreamFlow, RECEIVE_WINDOW, ackPayload} from '../../../../../lib/units/device/plugins/adb-bridge/flow.ts'

const {A_OKAY, A_WRTE} = AdbkitPacket
const LOCAL = 7
const THEIRS = 31

function fakeSocket({maxPayload = 4, delayedAck = false} = {}) {
    const writes: Buffer[] = []
    const drained: Array<() => void> = []
    return {
        maxPayload,
        delayedAck,
        writes,
        congested: false,
        whenDrained(callback: () => void) { drained.push(callback) },
        drain() { this.congested = false; drained.splice(0).forEach(callback => callback()) },
        send(command: number, arg0: number, arg1: number, data?: Buffer) {
            writes.push(AdbkitPacket.assemble(command, arg0, arg1, data))
        },
    }
}

/** A device socket whose writes complete only when told to; `flush` completes them in order. */
class Device extends Duplex {
    received: Buffer[] = []
    private pending: Array<() => void> = []
    held = false
    _read() {}
    _write(chunk: Buffer, _encoding: string, callback: () => void) {
        this.received.push(Buffer.from(chunk))
        if (this.held) {
            this.pending.push(callback)
        }
        else {
            callback()
        }
    }
    flush(count = Infinity) {
        while (count-- > 0 && this.pending.length) {
            this.pending.shift()!()
        }
    }
}

const settle = () => new Promise<void>(resolve => setImmediate(resolve))
const okay = (data?: Buffer) => ({command: A_OKAY, arg0: THEIRS, arg1: LOCAL, data})
const ack = (bytes?: number) => AdbkitPacket.assemble(A_OKAY, LOCAL, THEIRS, bytes === undefined ? undefined : ackPayload(bytes))
const wrte = (data: string) => AdbkitPacket.assemble(A_WRTE, LOCAL, THEIRS, Buffer.from(data))

function flow(options?: Parameters<typeof fakeSocket>[0], grant?: number) {
    const socket = fakeSocket(options)
    const device = new Device()
    const overrun = vi.fn()
    const stream = new StreamFlow(socket, device, LOCAL, THEIRS, overrun)
    device.on('readable', () => stream.pump())
    stream.start(grant)
    return {socket, device, stream, overrun}
}

describe('StreamFlow: plain mode, user -> device', () => {
    // What AOSP's receiver does: an A_OKAY as soon as less than a packet is
    // left queued (sockets.cpp:150-156). With nothing older queued, that is now.
    it('acknowledges a write at once when nothing older is queued', () => {
        const {socket, device, stream} = flow()
        device.held = true

        stream.write(Buffer.from('abcd'))

        expect(socket.writes).toEqual([ack()])
    })

    // ...but the next one waits until the one before it has left our buffer,
    // so a slow device holds at most one packet beyond the one being written.
    it('holds the next acknowledgement until the previous write is out', async() => {
        const {socket, device, stream} = flow()
        device.held = true
        stream.write(Buffer.from('abcd'))
        socket.writes.length = 0

        stream.write(Buffer.from('efgh'))
        expect(socket.writes).toEqual([])

        device.flush(1)
        await settle()
        expect(socket.writes).toEqual([ack()])
        expect(Buffer.concat(device.received).toString()).toBe('abcdefgh')
    })

    it('answers an empty write without waiting for anything', () => {
        const {socket, device, stream} = flow()
        device.held = true
        stream.write(Buffer.from('abcd'))
        stream.write(Buffer.from('efgh'))
        socket.writes.length = 0

        stream.write(Buffer.alloc(0))

        expect(socket.writes).toEqual([ack()])
    })

    it('sends nothing once stopped', async() => {
        const {socket, device, stream} = flow()
        device.held = true
        stream.write(Buffer.from('abcd'))
        stream.write(Buffer.from('efgh'))
        socket.writes.length = 0

        stream.stop()
        device.flush()
        await settle()

        expect(socket.writes).toEqual([])
    })
})

describe('StreamFlow: plain mode, device -> user', () => {
    it('sends one A_WRTE and waits for the user', async() => {
        const {socket, device, stream} = flow()

        device.push(Buffer.from('abcdefgh'))
        await settle()
        expect(socket.writes).toEqual([wrte('abcd')])

        stream.acknowledged(okay())
        expect(socket.writes).toEqual([wrte('abcd'), wrte('efgh')])
    })

    // A 4-byte payload is a delayed-ack credit, which this connection never
    // negotiated; AOSP ignores the packet (sockets.cpp:423-427)
    it('ignores an acknowledgement that carries a credit', async() => {
        const {socket, device, stream} = flow()
        device.push(Buffer.from('abcdefgh'))
        await settle()

        stream.acknowledged(okay(ackPayload(4)))

        expect(socket.writes).toEqual([wrte('abcd')])
    })
})

describe('StreamFlow: delayed ack', () => {
    // The receiver credits back what it wrote out (sockets.cpp:148-150)
    it('acknowledges each write with its size once it is out', async() => {
        const {socket, device, stream} = flow({delayedAck: true}, 100)
        device.held = true

        stream.write(Buffer.from('abc'))
        stream.write(Buffer.from('de'))
        expect(socket.writes).toEqual([])

        device.flush()
        await settle()
        expect(socket.writes).toEqual([ack(3), ack(2)])
    })

    // Several packets in flight: the point of delayed ack
    it('sends as much as the grant allows without waiting', async() => {
        const {socket, device} = flow({delayedAck: true}, 8)

        device.push(Buffer.from('abcdefghijkl'))
        await settle()

        expect(socket.writes).toEqual([wrte('abcd'), wrte('efgh')])
    })

    it('goes on once the user credits bytes back', async() => {
        const {socket, device, stream} = flow({delayedAck: true}, 4)
        device.push(Buffer.from('abcdefghijkl'))
        await settle()
        socket.writes.length = 0

        stream.acknowledged(okay(ackPayload(4)))

        expect(socket.writes).toEqual([wrte('efgh')])
    })

    // A full packet may go out while any grant is left (sockets.cpp:213-234)
    it('may overshoot the grant by up to one packet', async() => {
        const {socket, device} = flow({delayedAck: true}, 1)

        device.push(Buffer.from('abcdefgh'))
        await settle()

        expect(socket.writes).toEqual([wrte('abcd')])
    })

    // A bare A_OKAY under delayed ack is a mismatch AOSP ignores
    it('ignores an acknowledgement without a credit', async() => {
        const {socket, device, stream} = flow({delayedAck: true}, 4)
        device.push(Buffer.from('abcdefgh'))
        await settle()
        socket.writes.length = 0

        stream.acknowledged(okay())

        expect(socket.writes).toEqual([])
    })

    // A client that ignores our window would park its whole upload in our memory
    it('gives up on a client that sends far more than it was granted', () => {
        const {device, stream, overrun} = flow({delayedAck: true, maxPayload: 1024 * 1024})
        device.held = true
        const chunk = Buffer.alloc(1024 * 1024)

        for (let sent = 0; sent <= RECEIVE_WINDOW; sent += chunk.length) {
            stream.write(chunk)
        }
        expect(overrun).not.toHaveBeenCalled()

        stream.write(chunk)
        expect(overrun).toHaveBeenCalledOnce()
    })

    // Every stream on the connection shares the client's socket; with a big
    // grant each, a slow client would otherwise collect them all in memory
    it('waits while the client socket is congested and goes on once it drains', async() => {
        const {socket, device} = flow({delayedAck: true}, 100)
        socket.congested = true

        device.push(Buffer.from('abcd'))
        await settle()
        expect(socket.writes).toEqual([])

        socket.drain()
        expect(socket.writes).toEqual([wrte('abcd')])
    })
})
