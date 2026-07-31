import {Transform, TransformCallback} from 'node:stream'

const HEADER_SIZE = 4

/**
 * Parses the minirev framing protocol: [uint16LE connId][uint16LE length][payload].
 * A length-0 frame signals connection close and emits ('packet', connId, null).
 *
 * Identical wire format to forward/util/reader.js — rewritten in TypeScript
 * with class syntax; no util.inherits overhead.
 */
export class MinirevReader extends Transform {
    private readonly _header = Buffer.alloc(HEADER_SIZE)
    private _needLength = -HEADER_SIZE
    private _target = 0

    override _transform(chunk: Buffer, _encoding: string, done: TransformCallback): void {
        let cursor = 0
        while (cursor < chunk.length) {
            const diff = chunk.length - cursor
            if (this._needLength < 0) {
                // Still assembling a header
                if (diff < -this._needLength) {
                    chunk.copy(this._header, HEADER_SIZE + this._needLength, cursor, cursor + diff)
                    break
                }
                chunk.copy(this._header, HEADER_SIZE + this._needLength, cursor, cursor + -this._needLength)
                cursor += -this._needLength
                this._target = this._header.readUInt16LE(0)
                this._needLength = this._header.readUInt16LE(2)
                if (this._needLength === 0) {
                    // FIN frame
                    this.emit('packet', this._target, null)
                    this._needLength = -HEADER_SIZE
                }
            } else if (diff >= this._needLength) {
                // Full data frame
                this.emit('packet', this._target, chunk.subarray(cursor, cursor + this._needLength))
                cursor += this._needLength
                this._needLength = -HEADER_SIZE
            } else {
                // Partial data frame
                this.emit('packet', this._target, chunk.subarray(cursor, cursor + diff))
                this._needLength -= diff
                cursor += diff
            }
        }
        done()
    }
}
