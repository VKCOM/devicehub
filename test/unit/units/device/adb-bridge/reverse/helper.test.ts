import {describe, it, expect, vi} from 'vitest'
import {Duplex} from 'node:stream'
import {HelperForward} from '../../../../../../lib/units/device/plugins/adb-bridge/reverse/helper.ts'

/**
 * One stream to the device-side helper (Helper.java), as adbkit's openLocal
 * returns it: `written` is what we sent the helper, `say` plays the helper.
 */
class HelperStream extends Duplex {
    written = ''
    _read() {}
    _write(chunk: Buffer, _encoding: string, callback: () => void) {
        this.written += chunk.toString()
        callback()
    }
    say(text: string) {
        this.push(Buffer.from(text))
    }
}

const settle = () => new Promise<void>(resolve => setImmediate(resolve))

function helper() {
    const streams: HelperStream[] = []
    const openStream = vi.fn(async() => {
        const stream = new HelperStream()
        streams.push(stream)
        return stream
    })
    const accepted: HelperStream[] = []
    const accept = (device: unknown) => accepted.push(device as HelperStream)
    const lost = vi.fn()
    return {streams, openStream, accepted, accept, lost}
}

/** A forward the helper has agreed to: control stream answered OK. */
async function listening(port = 7777) {
    const h = helper()
    const forward = HelperForward.listen(h.openStream, port, h.accept, h.lost)
    await settle()
    h.streams[0].say('OK\n')
    return {...h, forward: await forward, control: h.streams[0]}
}

describe('HelperForward: binding', () => {
    // Only the device port goes to the device: the user's local spec stays in
    // the session.
    it('asks the helper to listen on the device port', async() => {
        const {control} = await listening(7777)

        expect(control.written).toBe('listen 7777\n')
    })

    // The helper answers only once the port is really listening, so waiting for
    // this answer is what keeps the user's OKAY honest.
    it('resolves only once the helper has answered', async() => {
        const h = helper()
        let resolved = false
        void HelperForward.listen(h.openStream, 7777, h.accept, h.lost).then(() => { resolved = true })
        await settle()
        expect(resolved).toBe(false)

        h.streams[0].say('OK\n')
        await settle()
        expect(resolved).toBe(true)
    })

    // The reason becomes the user's "cannot bind listener: <reason>" (session.ts)
    it('rejects with the helper reason when the port cannot be bound', async() => {
        const h = helper()
        const forward = HelperForward.listen(h.openStream, 7777, h.accept, h.lost)
        await settle()

        h.streams[0].say('FAIL bind failed: EADDRINUSE (Address already in use)\n')

        await expect(forward).rejects.toThrow('bind failed: EADDRINUSE (Address already in use)')
        expect(h.streams[0].destroyed).toBe(true)
    })

    it('rejects when the helper goes away before answering', async() => {
        const h = helper()
        const forward = HelperForward.listen(h.openStream, 7777, h.accept, h.lost)
        await settle()

        h.streams[0].push(null)

        await expect(forward).rejects.toThrow('the reverse helper closed the stream')
        expect(h.lost).not.toHaveBeenCalled()
    })

    it('rejects when the helper cannot be reached', async() => {
        const openStream = async(): Promise<never> => { throw new Error('closed') }

        await expect(HelperForward.listen(openStream, 7777, () => {}, () => {})).rejects.toThrow('closed')
    })
})

describe('HelperForward: connections', () => {
    // Every connection is fetched on a stream of its own, named by the token
    // the helper gave it: adb's flow control then works per connection.
    it('attaches each announced connection on a new stream', async() => {
        const {control, streams, accepted} = await listening()

        control.say('aaaa\nbbbb\n')
        await settle()

        expect(streams.slice(1).map(s => s.written)).toEqual(['attach aaaa\n', 'attach bbbb\n'])
        expect(accepted).toEqual(streams.slice(1))
    })

    it('reads a token split across chunks', async() => {
        const {control, streams} = await listening()

        control.say('ab')
        await settle()
        control.say('cd\n')
        await settle()

        expect(streams.slice(1).map(s => s.written)).toEqual(['attach abcd\n'])
    })

    // The helper closes a connection nobody attached in time; failing to open
    // the stream costs that one connection and nothing else.
    it('skips a connection whose stream cannot be opened', async() => {
        const {control, openStream, accepted} = await listening()
        openStream.mockRejectedValueOnce(new Error('device offline'))

        control.say('aaaa\nbbbb\n')
        await settle()

        expect(accepted).toHaveLength(1)
    })
})

describe('HelperForward: the end of a forward', () => {
    // Closing the control stream is the unbind: the helper closes its listener
    // when the stream ends.
    it('ends the control stream on close', async() => {
        const {forward, control, lost} = await listening()

        forward.close()
        await settle()

        expect(control.writableEnded).toBe(true)
        expect(lost).not.toHaveBeenCalled()
    })

    it('attaches nothing announced after the close', async() => {
        const {forward, control, streams} = await listening()

        forward.close()
        control.say('aaaa\n')
        await settle()

        expect(streams).toHaveLength(1)
    })

    // The helper died: its sockets close with it, the control stream ends.
    it('reports a control stream that ends on its own as lost, once', async() => {
        const {control, lost} = await listening()

        control.push(null)
        control.destroy()
        await settle()

        expect(lost).toHaveBeenCalledOnce()
    })

    // Not the helper talking: a line far longer than any token
    it('gives up on a control stream that sends garbage', async() => {
        const {control, lost, streams} = await listening()

        control.say('x'.repeat(1000))
        await settle()

        expect(lost).toHaveBeenCalledOnce()
        expect(streams).toHaveLength(1)
    })
})
