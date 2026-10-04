import {afterEach, describe, expect, it, vi} from 'vitest'
import {SilentDevices} from '../../../../lib/units/processor/silent-devices.js'
import {Any} from '../../../../lib/wire/google/protobuf/any.js'
import * as wire from '../../../../lib/wire/wire.js'

const closing: SilentDevices[] = []
afterEach(() => { closing.splice(0).forEach(s => s.close()); vi.useRealTimers() })
describe('processor silent dispatch', () => {
    it('renews expiry without rescanning the registry or repeating discovery', () => {
        vi.useFakeTimers()
        const broadcast = vi.fn(), discover = vi.fn()
        const now = vi.fn(() => Date.now())
        const devices = new SilentDevices(1000, broadcast, now, discover)
        closing.push(devices)
        const heartbeat = (provider: string, sequence = 1) => devices.consume(provider, 'same', {
            message: Any.pack({serial: 'same'}, wire.DeviceHeartbeatMessage),
            silentEvent: {instanceId: 'instance', sequence}
        }, () => {})
        expect(vi.getTimerCount()).toBe(0)
        for (let i = 0; i < 1000; i++) heartbeat('p' + i)
        expect(vi.getTimerCount()).toBe(1)
        vi.advanceTimersByTime(500)
        heartbeat('p0', 2)
        expect(discover).toHaveBeenCalledTimes(1000)
        now.mockClear()
        devices.expire()
        expect(now).toHaveBeenCalledTimes(2)
        expect(broadcast).not.toHaveBeenCalled()
        vi.advanceTimersByTime(500)
        expect(broadcast).toHaveBeenCalledTimes(999)
        vi.advanceTimersByTime(500)
        expect(broadcast).toHaveBeenCalledTimes(1000)
        const expired = Any.unpack(wire.Envelope.fromBinary(broadcast.mock.lastCall![0]).message!, wire.SilentDeviceEvent)
        expect(expired.providerName).toBe('p0')
        expect(expired.context?.sequence).toBe(3)
        expect(vi.getTimerCount()).toBe(0)
        heartbeat('p0', 3)
        expect(discover).toHaveBeenCalledTimes(1001)
        devices.close()
        expect(vi.getTimerCount()).toBe(0)
    })
    it('handles early iOS initialization, registration, probe and forbidden DB configuration separately', () => {
        const broadcast = vi.fn(), reply = vi.fn()
        const devices = new SilentDevices(1000, broadcast)
        closing.push(devices)
        let seq = 0
        const consume = (type: any, body = {}) => devices.consume('actual-provider', 's', {
            message: Any.pack(type.create(body), type),
            silentEvent: {instanceId: 'launch', sequence: ++seq}
        }, reply)
        expect(consume(wire.InitializeIosDeviceState)).toBe(true)
        expect(broadcast).not.toHaveBeenCalled()
        consume(wire.DeviceIosIntroductionMessage)
        expect(Any.contains(wire.Envelope.fromBinary(reply.mock.lastCall![0]).message!, wire.DeviceRegisteredMessage)).toBe(true)
        consume(wire.DeviceReadyMessage)
        expect(Any.contains(wire.Envelope.fromBinary(reply.mock.lastCall![0]).message!, wire.ProbeMessage)).toBe(true)
        consume(wire.ResolveAdbPortRequest, {requestId: 'id'})
        expect(Any.unpack(wire.Envelope.fromBinary(reply.mock.lastCall![0]).message!, wire.ResolveAdbPortResponse).error).toBeTruthy()
        expect(broadcast).not.toHaveBeenCalled()
        expect(devices.consume('p', 's', {message: Any.pack({serial: 's'}, wire.DeviceHeartbeatMessage)}, reply)).toBe(false)
    })
    it('addresses equal serials separately and forgets metadata on timeout', () => {
        const broadcast = vi.fn()
        let now = 0
        const devices = new SilentDevices(1000, broadcast, () => now)
        closing.push(devices)
        for (const provider of ['p1', 'p2']) devices.consume(provider, 'same', {
            message: Any.pack({json: '{}'}, wire.SilentDeviceSnapshot),
            silentEvent: {instanceId: provider, sequence: 1}
        }, () => {})
        const events = () => broadcast.mock.calls.map(([bytes]) => Any.unpack(wire.Envelope.fromBinary(bytes).message!, wire.SilentDeviceEvent))
        expect(events().map(e => e.providerName)).toEqual(['p1', 'p2'])
        now = 1001
        devices.expire()
        expect(events().slice(2).map(e => e.context!.instanceId)).toEqual(['p1', 'p2'])
        expect(events().slice(2).every(e => Any.contains(e.event!, wire.DeviceAbsentMessage))).toBe(true)
        devices.expire()
        expect(broadcast).toHaveBeenCalledTimes(4)
    })
})
