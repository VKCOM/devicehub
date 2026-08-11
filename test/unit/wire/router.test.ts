import {describe, it, expect, vi} from 'vitest'
import {WireRouter} from '../../../lib/wire/router.ts'
import {Envelope, DeviceHeartbeatMessage} from '../../../lib/wire/wire.ts'
import {Any} from '../../../lib/wire/google/protobuf/any.ts'

// Characterization test for decision 11: WireRouter is kept unchanged; only its
// event source moves from a `sub` socket to a `dealer` socket. The dealer, via
// SocketWrapper, emits 'message' as (frame0AsString, ...restFrames), so the
// handler is called as (channel, data) exactly like before. These tests pin
// that behaviour so the source swap is safe.

const packHeartbeat = (serial: string, channel?: string) =>
    Buffer.from(Envelope.toBinary({
        message: Any.pack({serial}, DeviceHeartbeatMessage),
        channel,
    }))

describe('WireRouter.handler as a dealer message source', () => {
    it('dispatches by protobuf type from a (channel, data) call', () => {
        const seen = vi.fn()
        const handler = new WireRouter()
            .on(DeviceHeartbeatMessage, seen)
            .handler()

        // Simulate dealer.on('message', handler): channel = frame0, data = frame1
        handler('some-channel', packHeartbeat('serial-1'))

        expect(seen).toHaveBeenCalledTimes(1)
        const [channel, message] = seen.mock.calls[0]
        expect(channel).toBe('some-channel')
        expect(message.serial).toBe('serial-1')
    })

    it('prefers the Envelope.channel over the transport channel when present', () => {
        const seen = vi.fn()
        const handler = new WireRouter()
            .on(DeviceHeartbeatMessage, seen)
            .handler()

        handler('transport-channel', packHeartbeat('serial-1', 'envelope-channel'))

        expect(seen.mock.calls[0][0]).toBe('envelope-channel')
    })

    it('silently ignores unregistered message types', () => {
        const handler = new WireRouter().handler()
        expect(() => handler('c', packHeartbeat('serial-1'))).not.toThrow()
    })
})
