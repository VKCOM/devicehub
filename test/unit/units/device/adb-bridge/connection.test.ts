import {describe, it, expect, vi} from 'vitest'
import {PassThrough} from 'node:stream'
import {
    ClientStream, handshake, makeKey, sign, tokens,
    A_AUTH, A_CLSE, A_CNXN, A_OKAY, A_OPEN, A_SYNC, A_WRTE,
    AUTH_RSAPUBLICKEY, AUTH_SIGNATURE, CLIENT_MAXDATA, CLIENT_VERSION
} from './fakeClient.ts'
import {BridgeConnection, bannerFeatures, type BridgeOptions} from '../../../../../lib/units/device/plugins/adb-bridge/connection.ts'
import {ackPayload, RECEIVE_WINDOW} from '../../../../../lib/units/device/plugins/adb-bridge/flow.ts'

const key = await makeKey()
const BANNER = 'device::ro.product.name=test;'

function connect(options: Partial<BridgeOptions> = {}) {
    const stream = new ClientStream()
    const opened: PassThrough[] = []
    const openService = vi.fn(async() => {
        const transport = new PassThrough()
        opened.push(transport)
        return transport
    })
    const connection = new BridgeConnection(stream, {
        auth: vi.fn(),
        banner: async() => BANNER,
        openService,
        openReverse: vi.fn(async() => { throw new Error('no reverse') }),
        ...options
    })
    const ended = vi.fn()
    connection.on('end', ended)
    return {stream, connection, openService, opened, ended}
}

async function authorized(options: Partial<BridgeOptions> = {}, banner?: string) {
    const c = connect(options)
    await handshake(c.stream, key, {banner})
    await vi.waitFor(() => expect(c.connection.authorized).toBe(true))
    c.stream.writes.length = 0
    return c
}

describe('BridgeConnection: handshake', () => {
    it('challenges a CNXN with a fresh 20-byte token', async() => {
        const {stream} = connect()

        stream.send(A_CNXN, CLIENT_VERSION, CLIENT_MAXDATA, 'host::\0')
        stream.send(A_CNXN, CLIENT_VERSION, CLIENT_MAXDATA, 'host::\0')

        await vi.waitFor(() => expect(tokens(stream)).toHaveLength(2))
        expect(tokens(stream)[0]).toHaveLength(20)
        expect(tokens(stream)[0]).not.toEqual(tokens(stream)[1])
    })

    // Every A_WRTE costs its sender a round trip before the next may go, so the
    // payload size bounds a stream's throughput over a slow link: 64 KiB at a
    // 20 ms round trip is about 3 MiB/s, 1 MiB about 50. A current adbd offers
    // 1 MiB (MAX_PAYLOAD, adb.h), and so do we.
    it('echoes the version and the client maxdata up to 1 MiB in its own CNXN', async() => {
        const c = connect()
        await handshake(c.stream, key)

        await vi.waitFor(() => expect(c.stream.received().at(-1)).toEqual({
            command: A_CNXN, arg0: CLIENT_VERSION, arg1: CLIENT_MAXDATA, data: Buffer.from(`${BANNER}features=delayed_ack`)
        }))
        expect(c.connection.maxPayload).toBe(1024 * 1024)
    })

    // More than that would be more than our packet parser accepts back
    it('caps maxdata at 1 MiB', async() => {
        const c = connect()

        c.stream.send(A_CNXN, CLIENT_VERSION, 4 * 1024 * 1024, 'host::\0')

        await vi.waitFor(() => expect(c.stream.received()).toHaveLength(1))
        expect(c.connection.maxPayload).toBe(1024 * 1024)
    })

    // An older client asking for less gets what it asked for
    it('keeps a smaller client maxdata', async() => {
        const c = connect()

        c.stream.send(A_CNXN, CLIENT_VERSION, 4096, 'host::\0')

        await vi.waitFor(() => expect(c.stream.received()).toHaveLength(1))
        expect(c.connection.maxPayload).toBe(4096)
    })

    it('hands the verified key to the auth hook before connecting', async() => {
        const auth = vi.fn()
        await authorized({auth})

        expect(auth).toHaveBeenCalledOnce()
        expect(auth.mock.calls[0][0].fingerprint).toBe(key.fingerprint)
    })

    it.each([
        ['the auth hook refuses the key', {auth: () => { throw new Error('not allowed') }}, {}],
        ['the signature is not of the token', {}, {validSignature: false}],
        ['the key cannot be parsed', {}, {keyString: 'broken key\0'}],
    ] as const)('closes the connection when %s', async(_reason, options, client) => {
        const c = connect(options)

        await handshake(c.stream, key, client)

        await vi.waitFor(() => expect(c.connection.ended).toBe(true))
        expect(c.connection.authorized).toBe(false)
        expect(c.stream.received().filter(p => p.command === A_CNXN)).toEqual([])
        expect(c.ended.mock.calls[0][0]).toBeInstanceOf(Error)
    })

    // adb signs the token with each of its keys in turn before sending a public
    // key; the first signature is the one checked, as adbkit's bridge did.
    it('checks the public key against the first signature', async() => {
        const other = await makeKey('other')
        const c = connect()
        c.stream.send(A_CNXN, CLIENT_VERSION, CLIENT_MAXDATA, 'host::\0')
        await vi.waitFor(() => expect(tokens(c.stream)).toHaveLength(1))
        const token = tokens(c.stream)[0]

        c.stream.send(A_AUTH, AUTH_SIGNATURE, 0, sign(key, token))
        c.stream.send(A_AUTH, AUTH_SIGNATURE, 0, sign(other, token))
        c.stream.send(A_AUTH, AUTH_RSAPUBLICKEY, 0, key.publicKey)

        await vi.waitFor(() => expect(c.connection.authorized).toBe(true))
    })

    it('closes the connection on a public key sent before any signature', async() => {
        const c = connect()
        c.stream.send(A_CNXN, CLIENT_VERSION, CLIENT_MAXDATA, 'host::\0')
        c.stream.send(A_AUTH, AUTH_RSAPUBLICKEY, 0, key.publicKey)

        await vi.waitFor(() => expect(c.connection.ended).toBe(true))
        expect(c.connection.authorized).toBe(false)
    })

    it('closes the connection on AUTH before CNXN', async() => {
        const c = connect()
        c.stream.send(A_AUTH, AUTH_SIGNATURE, 0, Buffer.alloc(256))

        await vi.waitFor(() => expect(c.connection.ended).toBe(true))
    })

    it('closes the connection on an unknown AUTH type', async() => {
        const c = connect()
        c.stream.send(A_CNXN, CLIENT_VERSION, CLIENT_MAXDATA, 'host::\0')
        c.stream.send(A_AUTH, 9, 0, Buffer.alloc(1))

        await vi.waitFor(() => expect(c.connection.ended).toBe(true))
    })
})

describe('BridgeConnection: before authentication', () => {
    // Serving anything before the key is checked would hand the device to
    // whoever connects.
    it.each([
        ['an OPEN', A_OPEN, 1, 0, 'shell:id\0'],
        ['a reverse: OPEN', A_OPEN, 1, 0, 'reverse:forward:tcp:1;tcp:2\0'],
        ['a WRTE', A_WRTE, 1, 2, 'x'],
    ] as const)('closes the connection on %s', async(_what, command, arg0, arg1, data) => {
        const c = connect()
        c.stream.send(command, arg0, arg1, data)

        await vi.waitFor(() => expect(c.connection.ended).toBe(true))
        expect(c.openService).not.toHaveBeenCalled()
        expect(c.ended.mock.calls[0][0]).toEqual(new Error('Unauthorized access'))
    })
})

describe('BridgeConnection: streams', () => {
    it('opens a service on the device and acknowledges it', async() => {
        const c = await authorized()

        c.stream.send(A_OPEN, 31, 0, 'shell:id\0')

        await vi.waitFor(() => expect(c.stream.received()).toEqual([
            {command: A_OKAY, arg0: expect.any(Number), arg1: 31, data: undefined}
        ]))
        expect(c.openService).toHaveBeenCalledWith('shell:id')
    })

    // The bug that took devices offline under Kaspresso: it forwards tcp:8500
    // and keeps connecting until its test listens there. A refused open has to
    // come back as A_CLSE(0, their id), and the connection has to survive it.
    it('answers a refused open with a failed-open CLSE and stays connected', async() => {
        const c = await authorized({openService: async() => { throw new Error("Failure: 'closed'") }})

        c.stream.send(A_OPEN, 31, 0, 'tcp:8500\0')
        c.stream.send(A_OPEN, 32, 0, 'tcp:8500\0')

        await vi.waitFor(() => expect(c.stream.received()).toEqual([
            {command: A_CLSE, arg0: 0, arg1: 31, data: undefined},
            {command: A_CLSE, arg0: 0, arg1: 32, data: undefined},
        ]))
        expect(c.connection.ended).toBe(false)
        expect(c.connection.services.count).toBe(0)
    })

    it('routes the client packets of a stream to it by our id', async() => {
        const c = await authorized()
        c.stream.send(A_OPEN, 31, 0, 'shell:cat\0')
        await vi.waitFor(() => expect(c.stream.received()).toHaveLength(1))
        const localId = c.stream.received()[0].arg0
        const sent: Buffer[] = []
        c.opened[0].on('data', chunk => sent.push(chunk))

        c.stream.send(A_WRTE, 31, localId, 'hello')
        c.stream.send(A_WRTE, 31, localId + 100, 'lost')

        await vi.waitFor(() => expect(Buffer.concat(sent).toString()).toBe('hello'))
        expect(c.connection.ended).toBe(false)
    })

    // reverse: is answered here, never relayed to the provider's adb server
    it('answers a reverse: request itself', async() => {
        const c = await authorized()

        c.stream.send(A_OPEN, 31, 0, 'reverse:list-forward\0')

        await vi.waitFor(() => expect(c.stream.received().map(p => p.command)).toEqual([A_OKAY, A_WRTE, A_CLSE]))
        expect(c.openService).not.toHaveBeenCalled()
        expect(c.stream.received()[1].data!.toString()).toBe('0000')
    })

    it('answers SYNC as adbkit did', async() => {
        const c = connect()
        c.stream.send(A_SYNC, 0, 0)

        await vi.waitFor(() => expect(c.stream.received()).toEqual([
            {command: A_SYNC, arg0: 1, arg1: 2, data: undefined}
        ]))
    })

    it('reports every packet as user activity', async() => {
        const c = connect()
        const activity = vi.fn()
        c.connection.on('userActivity', activity)

        c.stream.send(A_SYNC, 0, 0)

        await vi.waitFor(() => expect(activity).toHaveBeenCalledOnce())
    })
})

describe('BridgeConnection: closing', () => {
    it('closes every open stream, ends the socket and reports once', async() => {
        const c = await authorized()
        c.stream.send(A_OPEN, 31, 0, 'shell:cat\0')
        await vi.waitFor(() => expect(c.stream.received()).toHaveLength(1))
        const localId = c.stream.received()[0].arg0

        c.connection.end()
        c.connection.end()

        expect(c.stream.received().at(-1)).toEqual({command: A_CLSE, arg0: localId, arg1: 31, data: undefined})
        expect(c.opened[0].writableEnded).toBe(true)
        await vi.waitFor(() => expect(c.stream.finished).toBe(true))
        expect(c.ended).toHaveBeenCalledOnce()
        expect(c.ended).toHaveBeenCalledWith(undefined)
    })

    it('closes when the client hangs up', async() => {
        const c = connect()
        c.stream.push(null)

        await vi.waitFor(() => expect(c.ended).toHaveBeenCalledWith(undefined))
    })

    it('closes with the reason on a corrupt packet', async() => {
        const c = connect()
        c.stream.push(Buffer.alloc(24, 0xff))

        await vi.waitFor(() => expect(c.ended).toHaveBeenCalledWith(new Error('Magic value mismatch')))
    })

    it('closes with the reason on an unknown command', async() => {
        const c = await authorized()
        const bytes = Buffer.alloc(24)
        bytes.writeUInt32LE(0x11111111, 0)
        bytes.writeUInt32LE((0x11111111 ^ 0xffffffff) >>> 0, 20)
        c.stream.push(bytes)

        await vi.waitFor(() => expect(c.ended).toHaveBeenCalledWith(new Error('Unknown command 0x11111111')))
    })

    // A close that arrives while the provider is still checking the key must
    // not be followed by a CNXN on a socket we already ended.
    it('does not connect a client that left during authentication', async() => {
        let releaseBanner!: (banner: string) => void
        const c = connect({banner: () => new Promise(resolve => { releaseBanner = resolve })})
        await handshake(c.stream, key)
        await vi.waitFor(() => expect(releaseBanner).toBeDefined())

        c.connection.end()
        releaseBanner(BANNER)

        await new Promise(resolve => setImmediate(resolve))
        expect(c.connection.authorized).toBe(false)
        expect(c.stream.received().filter(p => p.command === A_CNXN)).toEqual([])
    })
})

/** The raw headers we sent, as [command, checksum, length] in order. */
function headers(stream: ClientStream): Array<[number, number, number]> {
    const bytes = Buffer.concat(stream.writes)
    const result: Array<[number, number, number]> = []
    for (let offset = 0; offset < bytes.length; offset += 24 + bytes.readUInt32LE(offset + 12)) {
        result.push([bytes.readUInt32LE(offset), bytes.readUInt32LE(offset + 16), bytes.readUInt32LE(offset + 12)])
    }
    return result
}

describe('BridgeConnection: delayed ack', () => {
    const BURST = 'host::features=shell_v2,cmd,delayed_ack'

    it('reads the features from a client banner as parse_banner does', () => {
        expect(bannerFeatures(Buffer.from(BURST))).toEqual(['shell_v2', 'cmd', 'delayed_ack'])
        expect(bannerFeatures(Buffer.from('host::\0'))).toEqual([])
        expect(bannerFeatures(Buffer.from('device::ro.product.name=x;features=a,b'))).toEqual(['a', 'b'])
        expect(bannerFeatures(undefined)).toEqual([])
    })

    // Both banners must list it (transport.cpp:1263-1271); ours always does,
    // a current adb only under ADB_BURST_MODE=1
    it('is on only when the client lists it', async() => {
        expect((await authorized({}, BURST)).connection.delayedAck).toBe(true)
        expect((await authorized()).connection.delayedAck).toBe(false)
    })

    // adb.cpp:506-511: arg1 is the opener's window exactly when delayed ack is on
    it.each([[false, 1], [true, 0]])('refuses an open whose arg1 does not match the mode (delayed: %s)', async(delayed, arg1) => {
        const c = await authorized({}, delayed ? BURST : undefined)

        c.stream.send(A_OPEN, 31, arg1, 'shell:id\0')

        await vi.waitFor(() => expect(c.stream.received()).toEqual([
            {command: A_CLSE, arg0: 0, arg1: 31, data: undefined}
        ]))
        expect(c.openService).not.toHaveBeenCalled()
        expect(c.connection.ended).toBe(false)
    })

    // adb.cpp:539-544: the open's A_OKAY carries what the opener may send us
    it('grants its window in the A_OKAY of an open', async() => {
        const c = await authorized({}, BURST)

        c.stream.send(A_OPEN, 31, 32 * 1024 * 1024, 'shell:id\0')

        await vi.waitFor(() => expect(c.stream.received()).toEqual([
            {command: A_OKAY, arg0: expect.any(Number), arg1: 31, data: ackPayload(RECEIVE_WINDOW)}
        ]))
    })

    it('grants its window to a reverse: request as well', async() => {
        const c = await authorized({}, BURST)

        c.stream.send(A_OPEN, 31, 32 * 1024 * 1024, 'reverse:list-forward\0')

        await vi.waitFor(() => expect(c.stream.received().map(p => p.command)).toEqual([A_OKAY, A_WRTE, A_CLSE]))
        expect(c.stream.received()[0].data).toEqual(ackPayload(RECEIVE_WINDOW))
    })

    // Up to the client's grant, without waiting for each A_OKAY
    it('sends device data ahead of the acknowledgements', async() => {
        const transport = new PassThrough()
        const c = await authorized({openService: async() => transport}, BURST)
        c.stream.send(A_OPEN, 31, 32 * 1024 * 1024, 'shell:\0')
        await vi.waitFor(() => expect(c.stream.received()).toHaveLength(1))

        transport.push(Buffer.from('first'))
        await vi.waitFor(() => expect(c.stream.received()).toHaveLength(2))
        transport.push(Buffer.from('second'))

        await vi.waitFor(() => expect(c.stream.received().map(p => p.data?.toString())).toEqual([
            expect.anything(), 'first', 'second'
        ]))
    })
})

describe('BridgeConnection: congestion', () => {
    it('reports a client that is behind and calls back once it caught up', async() => {
        const c = await authorized()
        const drained = vi.fn()
        expect(c.connection.congested).toBe(false)

        Object.defineProperty(c.stream, 'writableLength', {value: 8 * 1024 * 1024, configurable: true})
        expect(c.connection.congested).toBe(true)
        c.connection.whenDrained(drained)
        c.stream.emit('drain')

        expect(drained).toHaveBeenCalledOnce()
    })
})

describe('BridgeConnection: sending', () => {
    async function writeHello(version?: number) {
        const transport = new PassThrough()
        const c = connect({openService: async() => transport})
        await handshake(c.stream, key, {version})
        await vi.waitFor(() => expect(c.connection.authorized).toBe(true))
        c.stream.send(A_OPEN, 31, 0, 'shell:\0')
        await vi.waitFor(() => expect(c.stream.received()).toHaveLength(4))
        transport.push(Buffer.from('hello'))
        await vi.waitFor(() => expect(c.stream.received().at(-1)!.command).toBe(A_WRTE))
        return headers(c.stream).at(-1)!
    }

    // Every adb since 2017 skips checksums; computing one is a JS loop over
    // every byte we send.
    it('sends no checksum to a client that skips them', async() => {
        expect(await writeHello()).toEqual([A_WRTE, 0, 5])
    })

    it('still sends checksums to an old client', async() => {
        const sum = [...Buffer.from('hello')].reduce((a, b) => a + b)
        expect(await writeHello(0x01000000)).toEqual([A_WRTE, sum, 5])
    })

    it('writes the payload as given, next to its header', async() => {
        const transport = new PassThrough()
        const c = await authorized({openService: async() => transport})
        c.stream.send(A_OPEN, 31, 0, 'shell:\0')
        await vi.waitFor(() => expect(c.stream.received()).toHaveLength(1))
        const payload = Buffer.alloc(1000, 'p')
        const written = vi.spyOn(c.stream, 'write')

        transport.push(payload)

        await vi.waitFor(() => expect(written).toHaveBeenCalledTimes(2))
        expect(written.mock.calls[1][0]).toBe(payload)
    })
})

describe('BridgeConnection: socket life', () => {
    // A client gone without a FIN (NAT timeout, Wi-Fi switch) is otherwise
    // never noticed, and holds its streams and their provider connections.
    it('turns on TCP keepalive', () => {
        expect(connect().stream.keepAlive).toEqual([true, 30_000])
    })

    // The server's close() waits for every socket, and the device's release
    // waits for that: a client that never closes its side must not hold it.
    it('destroys a socket the client keeps open after we closed ours', () => {
        vi.useFakeTimers()
        try {
            const c = connect()
            c.connection.end()
            expect(c.stream.destroyed).toBe(false)

            vi.advanceTimersByTime(5_000)

            expect(c.stream.destroyed).toBe(true)
        }
        finally {
            vi.useRealTimers()
        }
    })

    it('leaves a socket the client closed in time alone', async() => {
        vi.useFakeTimers()
        try {
            const c = connect()
            const destroy = vi.spyOn(c.stream, 'destroy')
            c.connection.end()
            c.stream.emit('close')

            vi.advanceTimersByTime(5_000)

            expect(destroy).not.toHaveBeenCalled()
        }
        finally {
            vi.useRealTimers()
        }
    })
})
