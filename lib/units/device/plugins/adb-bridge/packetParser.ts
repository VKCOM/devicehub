/**
 * Incremental reader of the ADB wire protocol on the `adb connect` socket.
 *
 * Header layout (24 bytes, little-endian uint32 each):
 *   0 command | 4 arg0 | 8 arg1 | 12 length | 16 checksum | 20 magic | 24.. payload
 */

import {checksum, magic, HEADER_SIZE, type Packet} from './packet.ts'

/**
 * AOSP's MAX_PAYLOAD (adb.h), the most we advertise in our A_CNXN, so a
 * well-behaved client never exceeds it; a larger length is a broken or hostile
 * peer, and waiting for its body would only buffer it in memory.
 */
const MAX_PAYLOAD = 1024 * 1024

export class PacketParser {
    /** Bytes received but not yet parsed, as they came off the socket */
    private chunks: Buffer[] = []
    private length = 0
    /** The header of a packet whose payload is still incomplete */
    private head?: {command: number, arg0: number, arg1: number, length: number, check: number}

    /**
     * Feed bytes read from the socket; returns every packet they complete.
     * Throws on a corrupt header or payload, after which the stream is unusable.
     *
     * Bytes are joined once per packet, when all of it is in, rather than on
     * every read: a 64 KiB payload in small segments would otherwise be copied
     * over and over.
     */
    push(chunk: Buffer): Packet[] {
        this.chunks.push(chunk)
        this.length += chunk.length
        const packets: Packet[] = []

        for (;;) {
            if (!this.head) {
                if (this.length < HEADER_SIZE) {
                    break
                }
                const bytes = this.take(HEADER_SIZE)
                const command = bytes.readUInt32LE(0)
                if (bytes.readUInt32LE(20) !== magic(command)) {
                    throw new Error('Magic value mismatch')
                }
                const length = bytes.readUInt32LE(12)
                if (length > MAX_PAYLOAD) {
                    throw new Error(`Payload of ${length} bytes exceeds ${MAX_PAYLOAD}`)
                }
                this.head = {
                    command,
                    arg0: bytes.readUInt32LE(4),
                    arg1: bytes.readUInt32LE(8),
                    length,
                    check: bytes.readUInt32LE(16)
                }
            }

            if (this.length < this.head.length) {
                break
            }
            const {command, arg0, arg1, length, check} = this.head
            this.head = undefined
            // No payload means no data at all, not an empty buffer: a stream
            // treats `data` as something to write.
            const data = length ? this.take(length) : undefined
            // Since A_VERSION_SKIP_CHECKSUM (0x01000001) clients send 0 here
            if (check !== 0 && check !== checksum(data)) {
                throw new Error('Checksum mismatch')
            }
            packets.push({command, arg0, arg1, data})
        }

        return packets
    }

    /** The next `size` buffered bytes; only copied when they span chunks. */
    private take(size: number): Buffer {
        this.length -= size
        const first = this.chunks[0]
        if (first.length > size) {
            this.chunks[0] = first.subarray(size)
            return first.subarray(0, size)
        }
        if (first.length === size) {
            this.chunks.shift()
            return first
        }

        const bytes = Buffer.allocUnsafe(size)
        let offset = 0
        while (offset < size) {
            const chunk = this.chunks[0]
            const count = Math.min(chunk.length, size - offset)
            chunk.copy(bytes, offset, 0, count)
            offset += count
            if (count === chunk.length) {
                this.chunks.shift()
            }
            else {
                this.chunks[0] = chunk.subarray(count)
            }
        }
        return bytes
    }
}
