import {describe, it, expect} from 'vitest'
// Oracle: adbkit's own encoder. The bare '@u4/adbkit' import must stay first to
// break the dist import cycle; see packet.test.ts.
import '@u4/adbkit'
import AdbkitPacket from '../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/packet.js'
import {PacketParser} from '../../../../../lib/units/device/plugins/adb-bridge/packetParser.ts'

const {A_OPEN, A_OKAY, A_WRTE} = AdbkitPacket

describe('PacketParser', () => {
    it('reads a packet as adbkit encodes it', () => {
        const parsed = new PacketParser().push(AdbkitPacket.assemble(A_OPEN, 31, 0, Buffer.from('shell:ls\0')))

        expect(parsed).toEqual([{command: A_OPEN, arg0: 31, arg1: 0, data: Buffer.from('shell:ls\0')}])
    })

    // TCP delivers bytes, not packets: a packet may be split anywhere, and one
    // read may carry several.
    it('reassembles packets split across reads and splits packets sharing one', () => {
        const bytes = Buffer.concat([
            AdbkitPacket.assemble(A_WRTE, 1, 2, Buffer.from('hello')),
            AdbkitPacket.assemble(A_OKAY, 1, 2),
            AdbkitPacket.assemble(A_WRTE, 1, 2, Buffer.from('world')),
        ])
        const parser = new PacketParser()
        const parsed = []
        let cursor = 0
        for (const size of [3, 20, 7, 1, 30]) {
            parsed.push(...parser.push(bytes.subarray(cursor, cursor + size)))
            cursor += size
        }
        parsed.push(...parser.push(bytes.subarray(cursor)))

        expect(parsed).toEqual([
            {command: A_WRTE, arg0: 1, arg1: 2, data: Buffer.from('hello')},
            {command: A_OKAY, arg0: 1, arg1: 2, data: undefined},
            {command: A_WRTE, arg0: 1, arg1: 2, data: Buffer.from('world')},
        ])
    })

    // The worst case for a parser that joins on every read: a full payload
    // arriving one byte at a time.
    it('reads a 64 KiB payload fed one byte at a time', () => {
        const payload = Buffer.alloc(0xffff)
        for (let i = 0; i < payload.length; i++) {
            payload[i] = i & 0xff
        }
        const bytes = AdbkitPacket.assemble(A_WRTE, 1, 2, payload)
        const parser = new PacketParser()
        const parsed = []

        for (let i = 0; i < bytes.length; i++) {
            parsed.push(...parser.push(bytes.subarray(i, i + 1)))
        }

        expect(parsed).toEqual([{command: A_WRTE, arg0: 1, arg1: 2, data: payload}])
    })

    // No payload is no data, not an empty buffer: a stream treats `data` as
    // something to write.
    it('gives a packet without payload no data at all', () => {
        expect(new PacketParser().push(AdbkitPacket.assemble(A_OKAY, 1, 2))[0].data).toBeUndefined()
    })

    // Current clients skip the checksum and send 0 (A_VERSION_SKIP_CHECKSUM)
    it('accepts a zero checksum', () => {
        const bytes = AdbkitPacket.assemble(A_WRTE, 1, 2, Buffer.from('x'))
        bytes.writeUInt32LE(0, 16)

        expect(new PacketParser().push(bytes)).toHaveLength(1)
    })

    it('rejects a wrong checksum', () => {
        const bytes = AdbkitPacket.assemble(A_WRTE, 1, 2, Buffer.from('x'))
        bytes.writeUInt32LE(1, 16)

        expect(() => new PacketParser().push(bytes)).toThrow('Checksum mismatch')
    })

    it('rejects a wrong magic as soon as the header is in', () => {
        const bytes = AdbkitPacket.assemble(A_WRTE, 1, 2, Buffer.from('x'))
        bytes.writeUInt32LE(0, 20)

        expect(() => new PacketParser().push(bytes.subarray(0, 24))).toThrow('Magic value mismatch')
    })

    // Waiting for a body this size would only buffer whatever the peer sends
    it('rejects a payload larger than adb ever sends', () => {
        const header = AdbkitPacket.assemble(A_WRTE, 1, 2)
        header.writeUInt32LE(1024 * 1024 + 1, 12)

        expect(() => new PacketParser().push(header)).toThrow(/exceeds/)
    })
})
