//
// Parser of the scrcpy video socket (doc/develop.md in scrcpy, "Video and audio"):
//   - codec id (u32), once;
//   - then 12-byte headers, each followed by its payload for a media packet:
//       session packet: MSB set, (u32 flags, u32 width, u32 height);
//       media packet:   MSB clear, (u64 config/key-frame flags + PTS, u32 size).
//

export const SCRCPY_CODEC_H264 = 0x68323634

export const SCRCPY_HEADER_LENGTH = 12

const CONFIG_FLAG = 1n << 62n
const KEY_FRAME_FLAG = 1n << 61n
const PTS_MASK = (1n << 61n) - 1n

export type ScrcpyStreamItem =
    | {type: 'codec', codec: number}
    // `raw` is the 12-byte session packet as received
    | {type: 'session', width: number, height: number, raw: Buffer}
    // `raw` is the frame header followed by the payload, as received
    | {type: 'packet', config: boolean, keyFrame: boolean, pts: bigint, raw: Buffer}

export class ScrcpyStreamParser {
    private buffer: Buffer = Buffer.alloc(0)
    private codecRead = false

    push(chunk: Buffer): ScrcpyStreamItem[] {
        this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk
        const items: ScrcpyStreamItem[] = []

        for (;;) {
            if (!this.codecRead) {
                if (this.buffer.length < 4) {
                    break
                }
                items.push({type: 'codec', codec: this.buffer.readUInt32BE(0)})
                this.buffer = this.buffer.subarray(4)
                this.codecRead = true
                continue
            }

            if (this.buffer.length < SCRCPY_HEADER_LENGTH) {
                break
            }

            if (this.buffer[0] & 0x80) {
                const raw = Buffer.from(this.buffer.subarray(0, SCRCPY_HEADER_LENGTH))
                items.push({type: 'session', width: raw.readUInt32BE(4), height: raw.readUInt32BE(8), raw})
                this.buffer = this.buffer.subarray(SCRCPY_HEADER_LENGTH)
                continue
            }

            const size = this.buffer.readUInt32BE(8)
            if (this.buffer.length < SCRCPY_HEADER_LENGTH + size) {
                break
            }

            const flags = this.buffer.readBigUInt64BE(0)
            const raw = Buffer.from(this.buffer.subarray(0, SCRCPY_HEADER_LENGTH + size))
            items.push({
                type: 'packet',
                config: (flags & CONFIG_FLAG) !== 0n,
                keyFrame: (flags & KEY_FRAME_FLAG) !== 0n,
                pts: flags & PTS_MASK,
                raw
            })
            this.buffer = this.buffer.subarray(SCRCPY_HEADER_LENGTH + size)
        }

        return items
    }
}
