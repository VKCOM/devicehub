import {Transform, TransformCallback} from 'node:stream'

const HEADER_SIZE = 4
const MAX_PACKET_SIZE = 0xffff

/**
 * Frames outgoing data into minirev packets: [uint16LE connId][uint16LE length][payload].
 * On stream end, emits a FIN frame: [uint16LE connId][uint16LE 0].
 *
 * Identical wire format to forward/util/writer.js — rewritten in TypeScript
 * with class syntax; no util.inherits overhead.
 */
export class MinirevWriter extends Transform {
    private readonly _target: number

    constructor(target: number) {
        super()
        this._target = target
    }

    override _transform(fullChunk: Buffer, _encoding: string, done: TransformCallback): void {
        let chunk = fullChunk
        do {
            const length = Math.min(MAX_PACKET_SIZE, chunk.length)
            const header = Buffer.allocUnsafe(HEADER_SIZE)
            header.writeUInt16LE(this._target, 0)
            header.writeUInt16LE(length, 2)
            this.push(header)
            this.push(chunk.subarray(0, length))
            chunk = chunk.subarray(length)
        } while (chunk.length)
        done()
    }

    override _flush(done: TransformCallback): void {
        const header = Buffer.allocUnsafe(HEADER_SIZE)
        header.writeUInt16LE(this._target, 0)
        header.writeUInt16LE(0, 2)
        this.push(header)
        done()
    }
}
