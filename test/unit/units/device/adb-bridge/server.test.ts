import {describe, it, expect, vi, afterEach} from 'vitest'
import net from 'node:net'
import {once} from 'node:events'
import {BridgeServer} from '../../../../../lib/units/device/plugins/adb-bridge/server.ts'
import {BridgeConnection} from '../../../../../lib/units/device/plugins/adb-bridge/connection.ts'

const options = {
    auth: vi.fn(),
    banner: async() => 'device::',
    openService: vi.fn(),
    openReverse: vi.fn(),
}

const servers: BridgeServer[] = []
afterEach(async() => {
    for (const server of servers.splice(0)) {
        server.end()
        server.close()
    }
})

async function listening() {
    const server = new BridgeServer(options)
    servers.push(server)
    server.listen(0)
    await once(server, 'listening')
    return {server, port: (server.address() as net.AddressInfo).port}
}

describe('BridgeServer', () => {
    it('serves every TCP client with its own BridgeConnection', async() => {
        const {server, port} = await listening()
        const connection = once(server, 'connection')

        const client = net.connect(port, '127.0.0.1')
        const [accepted] = await connection

        expect(accepted).toBeInstanceOf(BridgeConnection)
        client.destroy()
    })

    // Stopping the plugin ends every client, then waits for 'close'
    it('ends its connections and then closes', async() => {
        const {server, port} = await listening()
        const connection = once(server, 'connection')
        const client = net.connect(port, '127.0.0.1')
        const [accepted] = await connection
        const clientEnded = once(client, 'end')
        // A real adb client closes its side once ours is done
        client.on('end', () => client.end())

        server.end()
        server.close()

        await clientEnded
        await once(server, 'close')
        expect((accepted as BridgeConnection).ended).toBe(true)
    })

    it('reports a port it cannot bind as an error', async() => {
        const {port} = await listening()
        const second = new BridgeServer(options)

        second.listen(port)
        const [error] = await once(second, 'error')

        expect((error as NodeJS.ErrnoException).code).toBe('EADDRINUSE')
    })
})
