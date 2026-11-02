import {describe, it, expect, vi} from 'vitest'
import {Duplex, PassThrough} from 'node:stream'
import net from 'node:net'
import {once} from 'node:events'
// Oracle: adbkit's own packet encoder and service map. The bare '@u4/adbkit'
// import must stay first to break the dist import cycle; see packet.test.ts.
import '@u4/adbkit'
import AdbkitPacket from '../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/packet.js'
import ServiceMap from '../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/servicemap.js'
import RollingCounter from '../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/rollingcounter.js'
import {DeviceService, serveOpen} from '../../../../../lib/units/device/plugins/adb-bridge/service.ts'

const {A_OKAY, A_WRTE, A_CLSE} = AdbkitPacket
const LOCAL = 7
const THEIRS = 31

function fakeSocket(maxPayload = 4096) {
    const writes: Buffer[] = []
    return {
        maxPayload,
        writes,
        remoteId: new RollingCounter(0xffffffff),
        services: new ServiceMap(),
        // Encoded by adbkit, the oracle for what goes on the wire
        send(command: number, arg0: number, arg1: number, data?: Buffer) {
            writes.push(AdbkitPacket.assemble(command, arg0, arg1, data))
        },
    }
}

/** The provider-side transport: what the user writes lands in `sent`, `push` plays the device. */
function fakeTransport() {
    const transport = new PassThrough()
    const sent: Buffer[] = []
    const device = new PassThrough()
    device.on('data', chunk => sent.push(chunk))
    // Writes go to `device`, reads come from `transport`'s own buffer
    transport.write = ((chunk: Buffer) => device.write(chunk)) as never
    return {transport, sent}
}

const packet = (command: number, data?: Buffer) => ({command, arg0: THEIRS, arg1: LOCAL, data})
const okay = () => AdbkitPacket.assemble(A_OKAY, LOCAL, THEIRS)
const close = (arg0 = LOCAL) => AdbkitPacket.assemble(A_CLSE, arg0, THEIRS)
const write = (data: Buffer) => AdbkitPacket.assemble(A_WRTE, LOCAL, THEIRS, data)

describe('DeviceService: opening', () => {
    // The provider's adb server answers FAIL "closed" for tcp:8500 with nothing
    // listening on the device. A real device answers A_CLSE(0, their id), and
    // that is what lets the user's client close its socket; adbkit's Service
    // answers nothing and leaks the rejection, which takes the worker down.
    it('answers a refused open with the failed-open A_CLSE and resolves', async() => {
        const socket = fakeSocket()
        const onEnd = vi.fn()
        const service = new DeviceService(socket, LOCAL, THEIRS, async() => { throw new Error('closed') }, onEnd)

        await expect(service.open('tcp:8500')).resolves.toBeUndefined()

        expect(socket.writes).toEqual([close(0)])
        expect(onEnd).toHaveBeenCalledOnce()
    })

    it('acknowledges the open once the provider accepted it', async() => {
        const socket = fakeSocket()
        const {transport} = fakeTransport()
        const openService = vi.fn(async() => transport)

        await new DeviceService(socket, LOCAL, THEIRS, openService).open('shell:ls')

        expect(openService).toHaveBeenCalledWith('shell:ls')
        expect(socket.writes).toEqual([okay()])
    })

    // The bridge connection went away while the provider was still answering.
    // adbkit throws LateTransportError and keeps the provider connection open.
    it('closes a transport that arrives after the stream ended', async() => {
        const socket = fakeSocket()
        const {transport} = fakeTransport()
        let resolve!: (t: PassThrough) => void
        const service = new DeviceService(socket, LOCAL, THEIRS, () => new Promise(r => { resolve = r }))

        const opening = service.open('shell:ls')
        service.end()
        resolve(transport)
        await opening

        expect(transport.destroyed).toBe(true)
        expect(socket.writes).toEqual([close(0)])
    })
})

describe('DeviceService: data', () => {
    async function opened(maxPayload?: number) {
        const socket = fakeSocket(maxPayload)
        const {transport, sent} = fakeTransport()
        const onEnd = vi.fn()
        const service = new DeviceService(socket, LOCAL, THEIRS, async() => transport, onEnd)
        await service.open('shell:ls')
        socket.writes.length = 0
        return {socket, transport, sent, service, onEnd}
    }

    it('relays user data to the device and acknowledges it', async() => {
        const {socket, sent, service} = await opened()

        service.handle(packet(A_WRTE, Buffer.from('hello')))

        await vi.waitFor(() => expect(Buffer.concat(sent).toString()).toBe('hello'))
        expect(socket.writes).toEqual([okay()])
    })

    // Without delayed ack only one A_WRTE may be in flight; the next waits
    // for the user's A_OKAY.
    it('sends device data one A_WRTE at a time, capped at maxPayload', async() => {
        const {socket, transport, service} = await opened(4)

        transport.push(Buffer.from('abcdef'))
        await vi.waitFor(() => expect(socket.writes).toEqual([write(Buffer.from('abcd'))]))

        service.handle(packet(A_OKAY))
        expect(socket.writes).toEqual([write(Buffer.from('abcd')), write(Buffer.from('ef'))])
    })

    // The device's last bytes must reach the user before the close does.
    it('closes after the device hung up and its data was delivered', async() => {
        const {socket, transport, service, onEnd} = await opened()

        transport.push(Buffer.from('bye'))
        transport.push(null)
        await vi.waitFor(() => expect(socket.writes).toEqual([write(Buffer.from('bye'))]))
        expect(onEnd).not.toHaveBeenCalled()

        service.handle(packet(A_OKAY))
        await vi.waitFor(() => expect(socket.writes).toEqual([write(Buffer.from('bye')), close()]))
        expect(onEnd).toHaveBeenCalledOnce()
    })

    it('closes the device side when the user closes, and only once', async() => {
        const {socket, transport, service, onEnd} = await opened()

        service.handle(packet(A_CLSE))
        service.handle(packet(A_CLSE))
        service.end()

        expect(transport.writableEnded).toBe(true)
        expect(socket.writes).toEqual([close()])
        expect(onEnd).toHaveBeenCalledOnce()
    })

    it('closes when the provider connection fails', async() => {
        const {socket, transport} = await opened()

        transport.destroy(new Error('ECONNRESET'))

        await vi.waitFor(() => expect(socket.writes).toEqual([close()]))
    })
})

describe('serveOpen', () => {
    // adbkit routes the user's A_OKAY/A_WRTE/A_CLSE by arg1 through the socket's
    // ServiceMap, and Socket.end ends whatever is in it.
    it('registers the stream in the socket service map until it ends', async() => {
        const socket = fakeSocket()
        const {transport} = fakeTransport()

        serveOpen(socket, {command: AdbkitPacket.A_OPEN, arg0: THEIRS, arg1: 0, data: Buffer.from('shell:ls\0')},
            async() => transport)
        const localId = 2 // RollingCounter's first id
        await vi.waitFor(() => expect(socket.writes).toEqual([AdbkitPacket.assemble(A_OKAY, localId, THEIRS)]))
        expect(socket.services.count).toBe(1)

        socket.services.end()

        expect(transport.writableEnded).toBe(true)
        expect(socket.writes[1]).toEqual(AdbkitPacket.assemble(A_CLSE, localId, THEIRS))
    })

    it('refuses an empty service name without asking the provider', () => {
        const socket = fakeSocket()
        const openService = vi.fn()

        serveOpen(socket, {command: AdbkitPacket.A_OPEN, arg0: THEIRS, arg1: 0, data: Buffer.from('\0')}, openService)

        expect(openService).not.toHaveBeenCalled()
        expect(socket.writes).toEqual([close(0)])
        expect(socket.services.count).toBe(0)
    })
})

describe('DeviceService: flow control and cleanup', () => {
    // Our A_OKAY is the client's permission to send its next write. Sent
    // regardless of the provider, a fast client (adb push over LAN to a device
    // on slow USB) would pile the whole file up in our memory. AOSP's receiver
    // asks for more once less than a packet is left queued (sockets.cpp:150-156):
    // the first write is acknowledged at once, the next only when the one
    // before it has left our buffer.
    it('acknowledges a write only once the one before it is out', async() => {
        const socket = fakeSocket()
        // A provider that takes writes only when told to
        const accept: Array<() => void> = []
        const transport = new Duplex({
            writableHighWaterMark: 4,
            read() {},
            write(_chunk, _encoding, callback) { accept.push(callback) },
        })
        const service = new DeviceService(socket, LOCAL, THEIRS, async() => transport)
        await service.open('sync:')
        socket.writes.length = 0

        service.handle(packet(A_WRTE, Buffer.from('more than four bytes')))
        expect(socket.writes).toEqual([okay()])
        service.handle(packet(A_WRTE, Buffer.from('and then some more')))
        expect(socket.writes).toEqual([okay()])

        accept.shift()!()
        await vi.waitFor(() => expect(socket.writes).toEqual([okay(), okay()]))
    })

    it('acknowledges at once while the provider keeps up', async() => {
        const socket = fakeSocket()
        const {transport} = fakeTransport()
        const service = new DeviceService(socket, LOCAL, THEIRS, async() => transport)
        await service.open('sync:')
        socket.writes.length = 0

        service.handle(packet(A_WRTE, Buffer.from('x')))

        expect(socket.writes).toEqual([okay()])
    })

    // A socket with unread data never reaches 'end' and never closes on its
    // own: every interrupted logcat or shell would keep an fd for good.
    it('closes a provider connection that still has unread data', async() => {
        const server = net.createServer(peer => {
            // Closed under it with data in flight: a reset is expected here
            peer.on('error', () => {})
            peer.write(Buffer.alloc(256 * 1024))
        })
        server.listen(0)
        await once(server, 'listening')
        const transport = net.connect((server.address() as net.AddressInfo).port, '127.0.0.1')
        await once(transport, 'connect')
        const socket = fakeSocket()
        const service = new DeviceService(socket, LOCAL, THEIRS, async() => transport)
        await service.open('shell:logcat')
        // The client stops acking, so the device data stays unread
        await vi.waitFor(() => expect(transport.readableLength).toBeGreaterThan(0))

        service.handle(packet(A_CLSE))

        await once(transport, 'close')
        server.close()
    })

    // adbkit re-emits a socket error that nobody else listens to on its shared
    // client, where nobody listens either: an uncaught exception.
    it('keeps listening for errors on a provider connection it closed', async() => {
        const socket = fakeSocket()
        const {transport} = fakeTransport()
        const service = new DeviceService(socket, LOCAL, THEIRS, async() => transport)
        await service.open('shell:')

        service.end()

        expect(transport.listenerCount('error')).toBeGreaterThan(0)
    })
})
