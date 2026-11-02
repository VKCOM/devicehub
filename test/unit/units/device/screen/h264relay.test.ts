import {describe, expect, it} from 'vitest'
import {H264Relay} from '../../../../../lib/units/device/plugins/screen/util/h264relay.js'
import type {ScrcpyStreamItem} from '../../../../../lib/units/device/resources/util/scrcpy-stream.js'

const session = (name: string): ScrcpyStreamItem => ({type: 'session', width: 1, height: 1, raw: Buffer.from(name)})
const config = (name: string): ScrcpyStreamItem =>
    ({type: 'packet', config: true, keyFrame: false, pts: 0n, raw: Buffer.from(name)})
const key = (name: string): ScrcpyStreamItem =>
    ({type: 'packet', config: false, keyFrame: true, pts: 0n, raw: Buffer.from(name)})
const delta = (name: string): ScrcpyStreamItem =>
    ({type: 'packet', config: false, keyFrame: false, pts: 0n, raw: Buffer.from(name)})

const client = () => {
    const received: string[] = []
    let buffered = 0
    return {
        received,
        setBuffered: (bytes: number) => {
            buffered = bytes
        },
        send: (data: Buffer) => received.push(data.toString()),
        bufferedAmount: () => buffered
    }
}

describe('H264Relay', () => {
    it('streams every packet to a client that joined first', () => {
        const relay = new H264Relay()
        const a = client()
        relay.add('a', a)
        for (const item of [session('s'), config('c'), key('k1'), delta('d1')]) {
            relay.push(item)
        }
        expect(a.received).toEqual(['s', 'c', 'k1', 'd1'])
    })

    it('starts a late client from the last key frame', () => {
        const relay = new H264Relay()
        for (const item of [session('s'), config('c'), key('k1'), delta('d1'), key('k2'), delta('d2')]) {
            relay.push(item)
        }
        const late = client()
        relay.add('late', late)
        relay.push(delta('d3'))
        expect(late.received).toEqual(['s', 'c', 'k2', 'd2', 'd3'])
    })

    it('makes a client that joins before the first key frame wait for it', () => {
        const relay = new H264Relay()
        relay.push(session('s'))
        relay.push(config('c'))
        const early = client()
        relay.add('early', early)
        relay.push(delta('lost'))
        relay.push(key('k1'))
        expect(early.received).toEqual(['s', 'c', 'k1'])
    })

    it('skips a backed up client to the next key frame instead of queueing', () => {
        const relay = new H264Relay(100)
        const slow = client()
        relay.add('slow', slow)
        relay.push(config('c'))
        relay.push(key('k1'))
        slow.setBuffered(1000)
        relay.push(delta('d1'))
        slow.setBuffered(0)
        // Without k1 + d1, d2 cannot be decoded
        relay.push(delta('d2'))
        relay.push(key('k2'))
        relay.push(delta('d3'))
        expect(slow.received).toEqual(['c', 'k1', 'k2', 'd3'])
    })

    it('makes every client wait for the key frame of a new session', () => {
        const relay = new H264Relay()
        const a = client()
        relay.add('a', a)
        relay.push(key('k1'))
        relay.push(session('rotated'))
        relay.push(delta('stale'))
        relay.push(config('c2'))
        relay.push(key('k2'))
        expect(a.received).toEqual(['k1', 'rotated', 'c2', 'k2'])
    })

    it('stops sending to a removed client', () => {
        const relay = new H264Relay()
        const a = client()
        relay.add('a', a)
        relay.remove('a')
        relay.push(key('k1'))
        expect(a.received).toEqual([])
    })
})
