import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import net from 'node:net'
import ADBObserver, {deviceSerial} from '../../../../lib/units/provider/ADBObserver.ts'

/** Minimal ADB server: answers one host service per connection, like the real one. */
function fakeAdbServer(reply: (command: string) => string) {
    const commands: string[] = []
    const server = net.createServer(socket => {
        let buffer = Buffer.alloc(0)
        // The observer drops its socket on destroy()
        socket.on('error', () => {})
        socket.on('data', data => {
            buffer = Buffer.concat([buffer, data])
            while (buffer.length >= 4) {
                const length = parseInt(buffer.subarray(0, 4).toString('ascii'), 16)
                if (buffer.length < 4 + length) return
                const command = buffer.subarray(4, 4 + length).toString('utf-8')
                buffer = buffer.subarray(4 + length)
                commands.push(command)

                const body = Buffer.from(reply(command), 'utf-8')
                socket.write(Buffer.concat([
                    Buffer.from('OKAY'),
                    Buffer.from(body.length.toString(16).padStart(4, '0')),
                    body
                ]))

                // Like the real server: every host request closes the connection
                socket.end()
                return
            }
        })
    })

    return {
        commands,
        listen: () => new Promise<number>(resolve =>
            server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port))
        ),
        close: () => new Promise<void>(resolve => server.close(() => resolve()))
    }
}

describe('ADBObserver connect/disconnect', () => {
    let connected: Set<string>
    let server: ReturnType<typeof fakeAdbServer>
    let observer: ADBObserver

    beforeEach(async() => {
        connected = new Set()
        server = fakeAdbServer(command => {
            if (command === 'host:devices') {
                return Array.from(connected, serial => `${serial}\tdevice\n`).join('')
            }
            const connect = command.match(/^host:connect:(.+)$/)
            if (connect) {
                if (connect[1].endsWith(':1')) return `failed to connect to '${connect[1]}': Connection refused`
                if (connected.has(connect[1])) return `already connected to ${connect[1]}`
                connected.add(connect[1])
                return `connected to ${connect[1]}`
            }
            const disconnect = command.match(/^host:disconnect:(.+)$/)
            if (disconnect) {
                connected.delete(disconnect[1])
                return `disconnected ${disconnect[1]}`
            }
            return ''
        })
        observer = new ADBObserver({host: '127.0.0.1', port: await server.listen()})
        // The provider always listens for errors; an unhandled 'error' event would throw
        observer.on('error', () => {})
        // As in the provider: polling runs concurrently with API commands
        observer.start()
    })

    afterEach(async() => {
        observer.destroy()
        await server.close()
    })

    it('connects and reports the device', async() => {
        const appeared = new Promise(resolve => observer.once('connect', resolve))

        await expect(observer.connect('10.0.0.5', 5555)).resolves.toBe('10.0.0.5:5555')
        expect(server.commands).toContain('host:connect:10.0.0.5:5555')

        const device: any = await appeared
        expect(device.serial).toBe('10.0.0.5:5555')
        expect(device.type).toBe('device')
    })

    it('treats "already connected" as success', async() => {
        connected.add('10.0.0.5:5555')
        await expect(observer.connect('10.0.0.5', 5555)).resolves.toBe('10.0.0.5:5555')
    })

    it('rejects with the ADB server message on failure', async() => {
        await expect(observer.connect('10.0.0.5', 1)).rejects.toThrow(/Connection refused/)
    })

    it('keeps working after the server closed the connection', async() => {
        await observer.connect('10.0.0.5', 5555)
        await expect(observer.connect('10.0.0.6', 5555)).resolves.toBe('10.0.0.6:5555')
        await observer.disconnect('10.0.0.5', 5555)
        await expect(observer.connect('10.0.0.7', 5555)).resolves.toBe('10.0.0.7:5555')
    })

    it('reconnects a wireless device with disconnect + connect', async() => {
        const appeared = new Promise<any>(resolve => observer.once('connect', resolve))
        await observer.connect('10.0.0.5', 5555)
        const device = await appeared

        await expect(device.reconnect()).resolves.toBe(true)
        expect(server.commands).toEqual(expect.arrayContaining([
            'host:disconnect:10.0.0.5:5555', 'host:connect:10.0.0.5:5555'
        ]))
    })

    it('disconnects', async() => {
        connected.add('10.0.0.5:5555')
        await observer.disconnect('10.0.0.5', 5555)
        expect(server.commands).toContain('host:disconnect:10.0.0.5:5555')
        expect(connected.has('10.0.0.5:5555')).toBe(false)
    })

    it('never reconnects devices with auto reconnect disabled', async() => {
        const appeared = new Promise<any>(resolve => observer.once('connect', resolve))
        await observer.connect('10.0.0.5', 5555)
        const device = await appeared

        observer.setAutoReconnect(device.serial, false)
        const before = server.commands.length
        await expect(device.reconnect()).resolves.toBe(false)
        expect(server.commands.slice(before)).toEqual([])
    })
})

describe('deviceSerial', () => {
    it.each([
        ['10.0.0.5', '10.0.0.5:5555'],
        ['emulator.local', 'emulator.local:5555'],
        ['::1', '[::1]:5555'],
        ['[::1]', '[::1]:5555'],
        ['fe80::1', '[fe80::1]:5555']
    ])('%s', (host, serial) => {
        expect(deviceSerial(host, 5555)).toBe(serial)
    })
})
