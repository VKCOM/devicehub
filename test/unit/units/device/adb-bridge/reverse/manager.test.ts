import {describe, it, expect} from 'vitest'
import {Duplex} from 'node:stream'
// Oracles: adbkit's own packet encoder, plus the very ServiceMap and
// RollingCounter instances a real tcpusb Socket owns. Our reverse streams share
// both with the user's client streams, so faking them would hide exactly the
// collisions we care about.
//
// Imported by file path because @u4/adbkit declares only "." in its package
// exports; the bare '@u4/adbkit' import must stay first to break the dist import
// cycle. See packet.test.ts for the full explanation. Do not reorder.
import '@u4/adbkit'
import AdbkitPacket from '../../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/packet.js'
import ServiceMap from '../../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/servicemap.js'
import RollingCounter from '../../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/rollingcounter.js'
import {ReverseStreamManager} from '../../../../../../lib/units/device/plugins/adb-bridge/reverse/manager.ts'
import {ReverseForwards} from '../../../../../../lib/units/device/plugins/adb-bridge/reverse/forwards.ts'

/**
 * Stand-in for the bridge connection, using adbkit's real id counter and
 * service map: those are the two pieces of state we share with client streams.
 */
function fakeSocket() {
    const writes: Buffer[] = []
    return {
        maxPayload: 4096,
        writes,
        remoteId: new RollingCounter(0xffffffff),
        services: new ServiceMap(),
        // Encoded by adbkit, the oracle for what goes on the wire
        send(command: number, arg0: number, arg1: number, data?: Buffer) {
            writes.push(AdbkitPacket.assemble(command, arg0, arg1, data))
        },
    }
}

/** One app connection as the helper hands it over: a stream of its own. */
class FakeDevice extends Duplex {
    received: Buffer[] = []
    _read() {}
    _write(chunk: Buffer, _encoding: string, callback: () => void) {
        this.received.push(Buffer.from(chunk))
        callback()
    }
}

const settle = () => new Promise<void>(resolve => setImmediate(resolve))

/** A forwards map with one live binding, as `adb reverse tcp:7777 tcp:8080` leaves it. */
function boundForwards() {
    const forwards = new ReverseForwards()
    forwards.exec('reverse:forward:tcp:7777;tcp:8080')
    return forwards
}

describe('ReverseStreamManager: a new connection on the device', () => {
    // An app on the device connected to the listening port. That is our cue to
    // ask the user's server to connect on their side.
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
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards())

        manager.accept(new FakeDevice())

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_OPEN, 2, 0, Buffer.from('tcp:8080\0')),
        ])
    })

    // Registration in the socket's ServiceMap is the only thing that makes the
    // stream reachable: the connection routes every incoming A_OKAY/A_WRTE/A_CLSE
    // through `services.get(packet.arg1)` and silently discards the packet when
    // nothing is registered. So without this the user's A_OKAY never arrives,
    // and the stream stays stuck with a zero peer id forever.
    it('registers the stream where the connection routes incoming packets', async() => {
        const socket = fakeSocket()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards())
        const device = new FakeDevice()
        manager.accept(device)
        device.push(Buffer.from('GET / HTTP/1.1\r\n'))
        await settle()
        socket.writes.length = 0

        // The user's server accepted the open and gave the stream its own id 31.
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})

        // Arrival is observable: the request bytes are released, now that the
        // peer id is known.
        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_WRTE, 2, 31, Buffer.from('GET / HTTP/1.1\r\n')),
        ])
    })

    // Every connection is its own stream with its own id: two apps (or two
    // requests of one app) never share a user-side socket.
    it('opens one user stream per device connection', () => {
        const socket = fakeSocket()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards())

        manager.accept(new FakeDevice())
        manager.accept(new FakeDevice())

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_OPEN, 2, 0, Buffer.from('tcp:8080\0')),
            AdbkitPacket.assemble(AdbkitPacket.A_OPEN, 3, 0, Buffer.from('tcp:8080\0')),
        ])
    })

    // The target is looked up per connection: after a rebind the next
    // connection goes to the new one, with the same listener (session.ts).
    it('connects the next connection to the target of a rebind', () => {
        const socket = fakeSocket()
        const forwards = boundForwards()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', forwards)

        forwards.exec('reverse:forward:tcp:7777;tcp:9090')
        manager.accept(new FakeDevice())

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_OPEN, 2, 0, Buffer.from('tcp:9090\0')),
        ])
    })

    // A connection the helper accepted just as the user removed the forward. The
    // user's server no longer has the spec, and an A_OPEN for it is LOG(FATAL)
    // there (adb.cpp:500): the app's connection is closed instead.
    it('closes a connection that arrives for a forward the user removed', async() => {
        const socket = fakeSocket()
        const forwards = boundForwards()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', forwards)
        forwards.exec('reverse:killforward:tcp:7777')
        const device = new FakeDevice()

        manager.accept(device)
        await settle()

        expect(socket.writes).toEqual([])
        expect(device.destroyed).toBe(true)
    })
})

describe('ReverseStreamManager: user → device', () => {
    // No framing any more: the device end of a connection is its own adb stream,
    // so the user's bytes reach the app exactly as they were sent.
    it('passes user bytes to the connection they belong to', async() => {
        const socket = fakeSocket()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards())
        const first = new FakeDevice()
        const second = new FakeDevice()
        manager.accept(first)
        manager.accept(second)
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})
        socket.services.get(3).handle({command: AdbkitPacket.A_OKAY, arg0: 32, arg1: 3})

        socket.services.get(3).handle({command: AdbkitPacket.A_WRTE, arg0: 32, arg1: 3, data: Buffer.from('to second')})
        await settle()

        expect(first.received).toEqual([])
        expect(second.received).toEqual([Buffer.from('to second')])
    })
})

describe('ReverseStreamManager: cleanup when a stream closes', () => {
    // Without removal ServiceMap.insert throws on id reuse once the counter
    // wraps, and every closed stream would stay reachable by its old id.
    it('removes the stream from services when the user closes it', () => {
        const socket = fakeSocket()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards())
        manager.accept(new FakeDevice())
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})

        socket.services.get(2).handle({command: AdbkitPacket.A_CLSE, arg0: 31, arg1: 2})

        expect(socket.services.get(2)).toBeFalsy()
    })

    it('removes the stream from services when the device hangs up', async() => {
        const socket = fakeSocket()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards())
        const device = new FakeDevice()
        manager.accept(device)
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})

        device.push(null)
        await settle()

        expect(socket.services.get(2)).toBeFalsy()
    })

    // The user closing one connection says nothing about the others.
    it('closes only the connection the user closed', async() => {
        const socket = fakeSocket()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards())
        const first = new FakeDevice()
        const second = new FakeDevice()
        manager.accept(first)
        manager.accept(second)
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})
        socket.services.get(3).handle({command: AdbkitPacket.A_OKAY, arg0: 32, arg1: 3})

        socket.services.get(2).handle({command: AdbkitPacket.A_CLSE, arg0: 31, arg1: 2})
        await settle()

        expect(first.destroyed).toBe(true)
        expect(second.destroyed).toBe(false)
    })
})

describe('ReverseStreamManager: the forward itself goes away', () => {
    // `adb reverse --remove`, the end of the `adb connect` session, the device
    // leaving its group: every connection still open under the forward is
    // closed both ways — an A_CLSE to the user, and the app's socket hung up.
    it('closes every open connection when the forward is torn down', async() => {
        const socket = fakeSocket()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards())
        const first = new FakeDevice()
        const second = new FakeDevice()
        manager.accept(first)
        manager.accept(second)
        socket.services.get(2).handle({command: AdbkitPacket.A_OKAY, arg0: 31, arg1: 2})
        socket.services.get(3).handle({command: AdbkitPacket.A_OKAY, arg0: 32, arg1: 3})
        socket.writes.length = 0

        manager.end()
        await settle()

        expect(socket.writes).toEqual([
            AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 2, 31),
            AdbkitPacket.assemble(AdbkitPacket.A_CLSE, 3, 32),
        ])
        expect(first.destroyed).toBe(true)
        expect(second.destroyed).toBe(true)
        expect(socket.services.get(2)).toBeFalsy()
        expect(socket.services.get(3)).toBeFalsy()
    })

    // A connection the helper had already accepted reaches us after the
    // teardown. Opening a stream for it would ask the user's server to connect
    // for a forward it has dropped — LOG(FATAL) (adb.cpp:500).
    it('closes a connection that arrives after the forward is gone', async() => {
        const socket = fakeSocket()
        const manager = new ReverseStreamManager(socket, 'tcp:7777', boundForwards())
        manager.end()
        const device = new FakeDevice()

        manager.accept(device)
        await settle()

        expect(socket.writes).toEqual([])
        expect(device.destroyed).toBe(true)
    })
})
