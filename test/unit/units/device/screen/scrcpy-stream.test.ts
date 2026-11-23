import {describe, expect, it} from 'vitest'
import {ScrcpyStreamParser, SCRCPY_CODEC_H264} from '../../../../../lib/units/device/resources/util/scrcpy-stream.js'

// Wire format of scrcpy 5 (doc/develop.md, "Video and audio")
const codec = () => {
    const b = Buffer.alloc(4)
    b.writeUInt32BE(SCRCPY_CODEC_H264)
    return b
}
const session = (width: number, height: number) => {
    const b = Buffer.alloc(12)
    b.writeUInt32BE(0x80000000, 0)
    b.writeUInt32BE(width, 4)
    b.writeUInt32BE(height, 8)
    return b
}
const media = (payload: Buffer, {config = false, keyFrame = false, pts = 0n} = {}) => {
    const header = Buffer.alloc(12)
    header.writeBigUInt64BE((config ? 1n << 62n : 0n) | (keyFrame ? 1n << 61n : 0n) | pts, 0)
    header.writeUInt32BE(payload.length, 8)
    return Buffer.concat([header, payload])
}

describe('ScrcpyStreamParser', () => {
    const stream = Buffer.concat([
        codec(),
        session(720, 1280),
        media(Buffer.from('sps-pps'), {config: true}),
        media(Buffer.from('key'), {keyFrame: true, pts: 1000n}),
        media(Buffer.from('delta'), {pts: 2000n})
    ])

    const expected = [
        {type: 'codec', codec: SCRCPY_CODEC_H264},
        {type: 'session', width: 720, height: 1280},
        {type: 'packet', config: true, keyFrame: false, pts: 0n},
        {type: 'packet', config: false, keyFrame: true, pts: 1000n},
        {type: 'packet', config: false, keyFrame: false, pts: 2000n}
    ]

    it('reads codec, session and media packets', () => {
        const items = new ScrcpyStreamParser().push(stream)
        expect(items).toMatchObject(expected)
        // Clients get each packet exactly as the device sent it
        expect(items[3].type === 'packet' && items[3].raw).toEqual(media(Buffer.from('key'), {keyFrame: true, pts: 1000n}))
    })

    it('reassembles packets split across chunks', () => {
        const parser = new ScrcpyStreamParser()
        const items = []
        // adb delivers arbitrary chunks: here one byte at a time
        for (let i = 0; i < stream.length; i++) {
            items.push(...parser.push(stream.subarray(i, i + 1)))
        }
        expect(items).toMatchObject(expected)
    })
})
