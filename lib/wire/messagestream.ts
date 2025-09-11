import stream from 'stream'

class DelimitedStream extends stream.Transform {
    private _length = 0
    private _lengthIndex = 0
    private _readingLength = true
    private _buffer = Buffer.alloc(0)

    _transform = (chunk: Buffer<ArrayBuffer>, encoding: any, done: () => void) => {
        this._buffer = Buffer.concat([this._buffer, chunk])
        while (this._buffer.length) {
            if (this._readingLength) {
                var byte = this._buffer[0]
                this._length += (byte & 0x7f) << (7 * this._lengthIndex)
                if (byte & (1 << 7)) {
                    this._lengthIndex += 1
                    this._readingLength = true
                }
                else {
                    this._lengthIndex = 0
                    this._readingLength = false
                }
                this._buffer = this._buffer.slice(1)
            }
            else {
                if (this._length <= this._buffer.length) {
                    this.push(this._buffer.slice(0, this._length))
                    this._buffer = this._buffer.slice(this._length)
                    this._length = 0
                    this._readingLength = true
                }
                else {
                    // Wait for more chunks
                    break
                }
            }
        }
        done()
    }
}

class DelimitingStream extends stream.Transform {
    _transform = (chunk: Buffer<ArrayBuffer>, encoding: any, done: () => void) => {
        let length = chunk.length
        const lengthBytes = []
        while (length > 0x7f) { // @ts-ignore
            lengthBytes.push((1 << 7) + (length & 0x7f))
            length >>= 7
        } // @ts-ignore
        lengthBytes.push(length)
        this.push(Buffer.from(lengthBytes))
        this.push(chunk)
        done()
    }
}
export {DelimitedStream}
export {DelimitingStream}
