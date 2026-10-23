import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import net from 'node:net'
import ADBObserver, {deviceSerial} from '../../../../lib/units/provider/ADBObserver.ts'

type Reply = string | {body: string, delayMs: number}

/**
 * Minimal ADB server: answers one host service per connection, like the real
 * one. After `host:transport:<serial>` the connection is a tunnel to the
 * device: it answers one `shell:` command, anything else sent there is
 * recorded as misrouted.
 */
function fakeAdbServer(reply: (command: string) => Reply) {
    const commands: string[] = []
    const misrouted: string[] = []
    const server = net.createServer(socket => {
        let buffer = Buffer.alloc(0)
        let transport = false
        // Whatever comes after a host request on its connection is never read
        let answering = false
        // The observer drops its socket on destroy()
        socket.on('error', () => {})
        socket.on('data', data => {
            if (answering) return
            buffer = Buffer.concat([buffer, data])
            while (buffer.length >= 4) {
                const length = parseInt(buffer.subarray(0, 4).toString('ascii'), 16)
                if (buffer.length < 4 + length) return
                const command = buffer.subarray(4, 4 + length).toString('utf-8')
                buffer = buffer.subarray(4 + length)
                commands.push(command)

                if (transport) {
                    if (command.startsWith('shell:')) {
                        socket.end(Buffer.from('OKAY31\n'))
                    }
                    else {
                        misrouted.push(command)
                        socket.end()
                    }
                    return
                }
                if (command.startsWith('host:transport:')) {
                    transport = true
                    // Slow enough for other requests to queue up meanwhile
                    setTimeout(() => socket.write('OKAY'), 50)
                    continue
                }

                answering = true
                const answer = reply(command)
                const {body, delayMs} = typeof answer === 'string' ? {body: answer, delayMs: 0} : answer
                const bytes = Buffer.from(body, 'utf-8')
                // Like the real server: every host request closes the connection
                setTimeout(() => socket.end(Buffer.concat([
                    Buffer.from('OKAY'),
                    Buffer.from(bytes.length.toString(16).padStart(4, '0')),
                    bytes
                ])), delayMs)
                return
            }
        })
    })

    return {
        commands,
        misrouted,
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
                // An unreachable host: adb gives up long after the observer does
                if (connect[1].startsWith('10.0.0.99:')) {
                    return {body: `failed to connect to '${connect[1]}': Operation timed out`, delayMs: 700}
                }
                if (connected.has(connect[1])) return `already connected to ${connect[1]}`
                connected.add(connect[1])
                return `connected to ${connect[1]}`
            }
            const disconnect = command.match(/^host:disconnect:(.+)$/)
            if (disconnect) {
                if (disconnect[1].startsWith('10.0.0.99:')) {
                    // Late, yet while the request after it still waits for its reply
                    return {body: `disconnected ${disconnect[1]}`, delayMs: 450}
                }
                connected.delete(disconnect[1])
                return `disconnected ${disconnect[1]}`
            }
            return ''
        })
        observer = new ADBObserver({host: '127.0.0.1', port: await server.listen(), requestTimeoutMs: 300})
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

    /* A reply that comes after its request timed out must not be read as the reply to another one */
    describe('late replies', () => {
        let lost: string[]
        let seen: string[]

        beforeEach(async() => {
            connected.add('10.0.0.5:5555')
            await observer.refresh()
            lost = []
            seen = []
            observer.on('disconnect', device => lost.push(device.serial))
            observer.on('connect', device => seen.push(device.serial))
        })

        it('a slow connect neither holds up polling nor garbles the device list', async() => {
            let settled = false
            const connecting = observer.connect('10.0.0.99', 5555, 500)
            connecting.catch(() => {}).finally(() => { settled = true })

            // Polling goes on while adb is still trying to connect
            await observer.refresh()
            expect(settled).toBe(false)

            await expect(connecting).rejects.toThrow(/timeout/i)
            await new Promise(resolve => setTimeout(resolve, 400)) // past adb's late reply
            await observer.refresh()

            expect(lost).toEqual([])
            expect(seen).toEqual([])
            expect(observer.getDevice('10.0.0.5:5555')?.type).toBe('device')
        })

        it('a timed out request leaves no reply behind for the next one', async() => {
            await expect(observer.disconnect('10.0.0.99', 5555)).rejects.toThrow(/timeout/i)
            // The next request goes out before adb's late reply comes
            await observer.refresh()
            await new Promise(resolve => setTimeout(resolve, 600)) // past adb's late reply
            await observer.refresh()

            expect(lost).toEqual([])
            expect(seen).toEqual([])
        })
    })

    it('forgets a device as soon as it is disconnected', async() => {
        connected.add('10.0.0.5:5555')
        await observer.refresh()

        await observer.disconnect('10.0.0.5', 5555)
        expect(observer.getDevice('10.0.0.5:5555')).toBeUndefined()
    })

    it('sends a device command through its transport before any other request', async() => {
        connected.add('10.0.0.5:5555')
        const queue = observer as any
        const [reply] = await Promise.all([
            queue.sendADBCommand('shell:getprop ro.build.version.sdk', '10.0.0.5:5555'),
            queue.sendADBCommand('host:devices')
        ])

        expect(reply).toBe('31')
        expect(server.misrouted).toEqual([])
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
