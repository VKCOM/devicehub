import {describe, it, expect} from 'vitest'
import {PassThrough} from 'node:stream'
// Oracle: adbkit's own packet code — the very code that parses whatever we emit
// and emits whatever we parse.
//
// Imported by file path because @u4/adbkit declares only "." in its package
// exports, so `@u4/adbkit/dist/...` is not importable under ESM — which is
// exactly why our own codec has to exist. The bare `@u4/adbkit` import below is
// load-order-significant, not decorative: adbkit's dist has an import cycle
// (utils -> parser/auth -> ... -> connection -> utils) that only resolves when
// the package entry point is evaluated first. Importing packetreader.js on its
// own throws "Cannot access 'Utils' before initialization".
// Test-only: production code must never reach into node_modules like this.
import '@u4/adbkit'
import AdbkitPacket from '../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/packet.js'
import PacketReader from '../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/packetreader.js'
import {
    assemble,
    A_SYNC, A_CNXN, A_OPEN, A_OKAY, A_CLSE, A_WRTE, A_AUTH,
} from '../../../../../lib/units/device/plugins/adb-reverse/packet.ts'

// Every byte we put on the tcpusb socket is parsed by the user's real adb
// server, which drops the connection on a bad magic or checksum. So the only
// meaningful specification for our codec is "indistinguishable from adbkit's".
describe('assemble', () => {
    it('encodes an A_OPEN with a payload exactly as adbkit does', () => {
        const name = Buffer.from('tcp:8080\0')

        const ours = assemble(A_OPEN, 2, 0, name)

        expect(ours).toEqual(AdbkitPacket.assemble(AdbkitPacket.A_OPEN, 2, 0, name))
    })

    // A payload-less packet must carry length 0 AND checksum 0, not a checksum
    // over an empty buffer that happens to also be 0 — the distinction matters
    // for A_OKAY/A_CLSE, which we send on every stream open and close.
    it('encodes a payload-less A_OKAY exactly as adbkit does', () => {
        const ours = assemble(A_OKAY, 2, 7, undefined)

        expect(ours).toEqual(AdbkitPacket.assemble(AdbkitPacket.A_OKAY, 2, 7, undefined))
        expect(ours).toHaveLength(24)
    })
})

// A single wrong constant sends the user's adb server a command it cannot parse.
describe('command constants', () => {
    it('match adbkit byte-for-byte', () => {
        expect({A_SYNC, A_CNXN, A_OPEN, A_OKAY, A_CLSE, A_WRTE, A_AUTH}).toEqual({
            A_SYNC: AdbkitPacket.A_SYNC,
            A_CNXN: AdbkitPacket.A_CNXN,
            A_OPEN: AdbkitPacket.A_OPEN,
            A_OKAY: AdbkitPacket.A_OKAY,
            A_CLSE: AdbkitPacket.A_CLSE,
            A_WRTE: AdbkitPacket.A_WRTE,
            A_AUTH: AdbkitPacket.A_AUTH,
        })
    })
})

// The real consumer of our bytes on the user's side is adbkit's PacketReader
// (the tcpusb Socket feeds it). It rejects bad magic and bad checksums, and it
// must survive a header split across TCP chunks — which is the normal case for
// a 4 KiB A_WRTE payload.
describe('round-trip through adbkit PacketReader', () => {
    const readAll = (chunks: Buffer[]): Promise<any[]> => new Promise((resolve, reject) => {
        const stream = new PassThrough()
        const packets: any[] = []
        const reader = new PacketReader(stream)
        reader.on('packet', (p: any) => packets.push(p))
        reader.on('error', reject)
        reader.on('end', () => resolve(packets))
        for (const chunk of chunks) {
            stream.write(chunk)
        }
        stream.end()
    })

    it('parses an A_WRTE we assembled, payload intact', async() => {
        const payload = Buffer.from('GET / HTTP/1.1\r\n\r\n')

        const packets = await readAll([assemble(A_WRTE, 2, 7, payload)])

        expect(packets).toHaveLength(1)
        expect(packets[0].command).toBe(A_WRTE)
        expect(packets[0].arg0).toBe(2)
        expect(packets[0].arg1).toBe(7)
        expect(packets[0].data).toEqual(payload)
    })

    it('parses a stream of packets whose headers are split across chunks', async() => {
        const payload = Buffer.alloc(4096, 0xab)
        const wire = Buffer.concat([
            assemble(A_OPEN, 2, 0, Buffer.from('tcp:8080\0')),
            assemble(A_WRTE, 2, 7, payload),
            assemble(A_CLSE, 2, 7),
        ])
        // Split mid-header of the second packet.
        const cut = 33
        const packets = await readAll([wire.subarray(0, cut), wire.subarray(cut)])

        expect(packets.map((p: any) => p.command)).toEqual([A_OPEN, A_WRTE, A_CLSE])
        expect(packets[1].data).toEqual(payload)
    })
})
