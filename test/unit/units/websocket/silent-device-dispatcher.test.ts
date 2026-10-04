import {afterEach, describe, expect, it, vi} from 'vitest'
import {SilentDeviceDispatcher} from '../../../../lib/units/websocket/support/silent-device-dispatcher.js'
import {Any} from '../../../../lib/wire/google/protobuf/any.js'
import {SilentDeviceSnapshot, type SilentDeviceEvent} from '../../../../lib/wire/wire.js'

afterEach(() => vi.restoreAllMocks())
const snapshot = (provider = 'p'): SilentDeviceEvent => ({providerName: provider, serial: 'same',
    context: {instanceId: 'instance', sequence: 1},
    event: Any.pack({json: '{"serial":"same"}'}, SilentDeviceSnapshot)})

describe('silent event dispatcher', () => {
    it('decodes once for matching sessions and skips all foreign devices', () => {
        const dispatch = new SilentDeviceDispatcher(vi.fn())
        const receive = vi.fn()
        for (let i = 0; i < 1000; i++) dispatch.subscribe('other-' + i, 'same', receive)
        const first = vi.fn(), second = vi.fn()
        dispatch.subscribe('p', 'same', first)
        dispatch.subscribe('p', 'same', second)
        const event = snapshot()
        const unpack = vi.spyOn(Any, 'unpack')
        const parse = vi.spyOn(JSON, 'parse')
        dispatch.dispatch(event)
        expect(unpack).toHaveBeenCalledTimes(1)
        expect(parse).toHaveBeenCalledTimes(1)
        expect(first).toHaveBeenCalledTimes(1)
        expect(second).toHaveBeenCalledWith(first.mock.calls[0][0])
        expect(receive).not.toHaveBeenCalled()
    })
    it('does not decode events without subscribers, including after unsubscribe and close', () => {
        const dispatch = new SilentDeviceDispatcher(vi.fn())
        const event = snapshot()
        const receive = vi.fn(), unpack = vi.spyOn(Any, 'unpack')
        dispatch.dispatch(event)
        const remove = dispatch.subscribe('p', 'same', receive)
        remove()
        dispatch.dispatch(event)
        dispatch.subscribe('p', 'same', receive)
        dispatch.close()
        dispatch.dispatch(event)
        expect(unpack).not.toHaveBeenCalled()
        expect(receive).not.toHaveBeenCalled()
    })
    it('isolates a failed subscriber and malformed snapshot from other sessions', () => {
        const errors = vi.fn(), receive = vi.fn()
        const dispatch = new SilentDeviceDispatcher(errors)
        dispatch.subscribe('p', 'same', () => { throw new Error('failed socket') })
        dispatch.subscribe('p', 'same', receive)
        dispatch.dispatch(snapshot())
        expect(receive).toHaveBeenCalledOnce()
        const invalid = snapshot()
        invalid.event = Any.pack({json: '{'}, SilentDeviceSnapshot)
        expect(() => dispatch.dispatch(invalid)).not.toThrow()
        expect(errors).toHaveBeenCalledTimes(2)
        expect(receive).toHaveBeenCalledTimes(1)
        dispatch.dispatch(snapshot())
        expect(receive).toHaveBeenCalledTimes(2)
    })
})
