/**
 * Minimal ADB wire-packet codec.
 *
 * `@u4/adbkit` already ships this logic in `dist/adb/tcpusb/packet.js`, but its
 * package.json declares only "." in `exports`, so under ESM there is no way to
 * import it. Rather than patch the dependency, we re-implement the few bytes we
 * need. The unit tests pin every function against adbkit's own implementation,
 * because adbkit is what parses the packets we emit: a wrong magic or checksum
 * makes the user's adb server drop the connection.
 *
 * Header layout (24 bytes, little-endian uint32 each):
 *   0 command | 4 arg0 | 8 arg1 | 12 length | 16 checksum | 20 magic | 24.. payload
 */

export const A_SYNC = 0x434e5953
export const A_CNXN = 0x4e584e43
export const A_OPEN = 0x4e45504f
export const A_OKAY = 0x59414b4f
export const A_CLSE = 0x45534c43
export const A_WRTE = 0x45545257
export const A_AUTH = 0x48545541

const HEADER_SIZE = 24

/** Naive sum of the payload bytes — ADB's "checksum", not a CRC. */
export function checksum(data?: Buffer): number {
    let sum = 0
    if (data) {
        for (let i = 0, len = data.length; i < len; i++) {
            sum += data[i]
        }
    }
    return sum
}

/** The header's magic field: the command with every bit flipped. */
export function magic(command: number): number {
    // ">>> 0" keeps the result in the unsigned uint32 range
    return (command ^ 0xffffffff) >>> 0
}

/** Encode a packet, byte-for-byte identical to adbkit's Packet.assemble. */
export function assemble(command: number, arg0: number, arg1: number, data?: Buffer): Buffer {
    if (data) {
        const chunk = Buffer.alloc(HEADER_SIZE + data.length)
        chunk.writeUInt32LE(command, 0)
        chunk.writeUInt32LE(arg0, 4)
        chunk.writeUInt32LE(arg1, 8)
        chunk.writeUInt32LE(data.length, 12)
        chunk.writeUInt32LE(checksum(data), 16)
        chunk.writeUInt32LE(magic(command), 20)
        data.copy(chunk, HEADER_SIZE)
        return chunk
    }

    const chunk = Buffer.alloc(HEADER_SIZE)
    chunk.writeUInt32LE(command, 0)
    chunk.writeUInt32LE(arg0, 4)
    chunk.writeUInt32LE(arg1, 8)
    chunk.writeUInt32LE(0, 12)
    chunk.writeUInt32LE(0, 16)
    chunk.writeUInt32LE(magic(command), 20)
    return chunk
}
