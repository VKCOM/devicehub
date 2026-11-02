import {describe, it, expect, vi, afterEach} from 'vitest'
import net from 'node:net'
import {once} from 'node:events'
import {PassThrough} from 'node:stream'
import {AdbFailError, AdbPrematureEOFError} from '@u4/adbkit'
import {createProvider} from '../../../../../lib/units/device/plugins/adb-bridge/provider.ts'

/**
 * A connection to the provider's adb server, already switched to the device.
 * `answer` is what the server says to the next request on it.
 */
function fakeConnection(answer: 'OKAY' | 'FAIL' | 'EOF' = 'OKAY', socket: any = new PassThrough()) {
    const written: string[] = []
    return {
        socket,
        written,
        write(chunk: Buffer) { written.push(chunk.toString()) },
        end() {},
        parser: {
            async readCode() {
                if (answer === 'FAIL') throw new AdbFailError('closed', 'tcp:8500')
                if (answer === 'EOF') throw new AdbPrematureEOFError(4, '')
                return 'OKAY'
            },
            async readValue() { return 'shell_v2,cmd,stat_v2' }
        }
    }
}

/**
 * `answers` go to the connections in the order they are made; on a cold pool
 * the first open starts two for the pool and then one of its own.
 */
function fakeAdb(answers: Array<'OKAY' | 'FAIL' | 'EOF'> = []) {
    const made: ReturnType<typeof fakeConnection>[] = []
    const transport = vi.fn(async() => {
        const connection = fakeConnection(answers.shift() ?? 'OKAY')
        made.push(connection)
        return connection
    })
    const connection = vi.fn(async() => fakeConnection())
    const adb = {getDevice: () => ({transport, getProperties: async() => ({})}), connection}
    return {adb: adb as any, transport, made, connection}
}

const settle = () => new Promise<void>(resolve => setImmediate(resolve))

describe('provider: stream opens', () => {
    // A switch is a round trip of its own; the next open should not pay for it
    it('opens the next stream on a connection switched in advance', async() => {
        const {adb, transport, made} = fakeAdb()
        const provider = createProvider(adb, 'serial')
        await provider.openService('shell:id')
        await settle()
        const switched = transport.mock.calls.length

        const socket = await provider.openService('shell:ls')

        expect(made.find(c => c.socket === socket)!.written).toEqual(['0008shell:ls'])
        // It came from the pool, which refills behind it
        expect(made.indexOf(made.find(c => c.socket === socket)!)).toBeLessThan(switched)
    })

    // The device's own refusal is the answer; asking again would open twice
    it('does not retry a refused open', async() => {
        const {adb, transport} = fakeAdb(['FAIL', 'FAIL', 'OKAY'])
        const provider = createProvider(adb, 'serial')
        await provider.openService('shell:id')
        await settle()
        const made = transport.mock.calls.length

        await expect(provider.openService('tcp:8500')).rejects.toBeInstanceOf(AdbFailError)
        // Only the pool's refill, no second attempt
        expect(transport).toHaveBeenCalledTimes(made + 1)
    })

    // A kept connection the server closed (the device went away and came back)
    // ends without an answer; that is not the device refusing
    it('retries on a fresh connection when a kept one died', async() => {
        const {adb, made} = fakeAdb(['EOF', 'EOF', 'OKAY'])
        const provider = createProvider(adb, 'serial')
        await provider.openService('shell:id')
        await settle()

        const socket = await provider.openService('shell:ls')

        expect(made.find(c => c.socket === socket)!.written).toEqual(['0008shell:ls'])
    })

    it('closes the kept connections on release, and any that finish switching afterwards', async() => {
        const {adb, made} = fakeAdb()
        const provider = createProvider(adb, 'serial')
        await provider.openService('shell:id')
        await settle()

        provider.release()

        expect(made.slice(0, 2).every(c => c.socket.destroyed)).toBe(true)
        expect(made[2].socket.destroyed).toBe(false)
    })
})

describe('provider: kept connections', () => {
    const closing: Array<() => void> = []
    afterEach(() => closing.splice(0).forEach(close => close()))

    // Nothing reads an idle connection, so the server's close has to be noticed
    // some other way, or a dead connection would sit in the pool
    it('drops a kept connection the server closes', async() => {
        const server = net.createServer()
        server.listen(0, '127.0.0.1')
        await once(server, 'listening')
        const peers: net.Socket[] = []
        server.on('connection', peer => peers.push(peer))
        closing.push(() => server.close())
        const sockets: net.Socket[] = []
        const transport = vi.fn(async() => {
            const socket = net.connect((server.address() as net.AddressInfo).port, '127.0.0.1')
            await once(socket, 'connect')
            sockets.push(socket)
            closing.push(() => socket.destroy())
            return fakeConnection('OKAY', socket)
        })
        const provider = createProvider({getDevice: () => ({transport})} as any, 'serial')
        await provider.openService('shell:id')
        await vi.waitFor(() => expect(sockets).toHaveLength(3))
        await vi.waitFor(() => expect(peers).toHaveLength(3))

        peers.forEach(peer => peer.end())

        await vi.waitFor(() => expect(sockets.slice(0, 2).every(socket => socket.destroyed)).toBe(true))
        const socket = await provider.openService('shell:ls')
        expect(sockets.slice(0, 2)).not.toContain(socket)
    })
})

describe('provider: device features', () => {
    it("reads the device's feature list from the adb server", async() => {
        const {adb, connection} = fakeAdb()

        expect(await createProvider(adb, 'serial').features()).toEqual(['shell_v2', 'cmd', 'stat_v2'])
        const made = await connection.mock.results[0].value
        expect(made.written).toEqual(['001bhost-serial:serial:features'])
    })

    // An adb server older than the request answers FAIL; the device then gets
    // the legacy protocols, as it would from that server directly
    it('reports no features when the server cannot tell', async() => {
        const {adb} = fakeAdb()
        adb.connection = async() => fakeConnection('FAIL')

        expect(await createProvider(adb, 'serial').features()).toEqual([])
    })
})
