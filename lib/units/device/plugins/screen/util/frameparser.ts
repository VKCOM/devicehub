export default class FrameParser {
    private readFrameBytes: number
    private frameBodyLength: number
    private frameBody: Buffer | null
    private cursor: number
    private chunk: Buffer | null

    constructor() {
        this.readFrameBytes = 0
        this.frameBodyLength = 0
        this.frameBody = null
        this.cursor = 0
        this.chunk = null
    }

    push(chunk: Buffer): void {
        if (this.chunk) {
            throw new Error('Must consume pending frames before pushing more chunks')
        }
        this.chunk = chunk
    }

    nextFrame(): Buffer | null {
        if (!this.chunk) {
            return null
        }

        const len = this.chunk.length
        while (this.cursor < len) {
            if (this.readFrameBytes < 4) {
                this.frameBodyLength +=
                    (this.chunk[this.cursor] << (this.readFrameBytes * 8)) >>> 0
                this.cursor += 1
                this.readFrameBytes += 1
            } else {
                const bytesLeft = len - this.cursor
                if (bytesLeft >= this.frameBodyLength) {
                    let completeBody: Buffer
                    if (this.frameBody) {
                        completeBody = Buffer.concat([
                            this.frameBody,
                            this.chunk.slice(this.cursor, this.cursor + this.frameBodyLength),
                        ])
                    } else {
                        completeBody = this.chunk.slice(this.cursor, this.cursor + this.frameBodyLength)
                    }
                    this.cursor += this.frameBodyLength
                    this.frameBodyLength = this.readFrameBytes = 0
                    this.frameBody = null
                    return completeBody
                } else {
                    // @todo Consider/benchmark continuation frames to prevent
                    // potential Buffer thrashing.
                    if (this.frameBody) {
                        this.frameBody = Buffer.concat([
                            this.frameBody,
                            this.chunk.slice(this.cursor, len),
                        ])
                    } else {
                        this.frameBody = this.chunk.slice(this.cursor, len)
                    }
                    this.frameBodyLength -= bytesLeft
                    this.readFrameBytes += bytesLeft
                    this.cursor = len
                }
            }
        }

        this.cursor = 0
        this.chunk = null
        return null
    }
}

