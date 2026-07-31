import {describe, it, expect} from 'vitest'
import {ClientDispatcher} from '../../../../lib/units/websocket/support/clientDispatcher.ts'

// The websocket unit must NOT create a WireRouter (and channelRouter listeners)
// per client — that leaks listeners. ClientDispatcher is the unit-wide fan-out:
// every connection registers a per-type handler map once; a single broadcast
// decode point calls dispatch(), which invokes each connection's handler for that type.
describe('ClientDispatcher', () => {
    it('dispatches a broadcast to every connection subscribed to that type', () => {
        const hub = new ClientDispatcher()
        const seenA: any[] = []
        const seenB: any[] = []
        hub.add('a', {DeviceChange: (ch, msg) => seenA.push({ch, msg})})
        hub.add('b', {DeviceChange: (ch, msg) => seenB.push({ch, msg})})

        hub.dispatch('DeviceChange', 'chan', {serial: 's1'})

        expect(seenA).toEqual([{ch: 'chan', msg: {serial: 's1'}}])
        expect(seenB).toEqual([{ch: 'chan', msg: {serial: 's1'}}])
    })

    it('only invokes handlers registered for the dispatched type', () => {
        const hub = new ClientDispatcher()
        let deviceChangeCalls = 0
        let userChangeCalls = 0
        hub.add('a', {
            DeviceChange: () => deviceChangeCalls++,
            UserChange: () => userChangeCalls++,
        })

        hub.dispatch('DeviceChange', '', {})

        expect(deviceChangeCalls).toBe(1)
        expect(userChangeCalls).toBe(0)
    })

    it('stops dispatching to a removed connection (no listener leak)', () => {
        const hub = new ClientDispatcher()
        let calls = 0
        hub.add('a', {DeviceChange: () => calls++})

        hub.dispatch('DeviceChange', '', {})
        hub.remove('a')
        hub.dispatch('DeviceChange', '', {})

        expect(calls).toBe(1)
    })

    it('isolates a throwing handler so other connections still receive the event', () => {
        const hub = new ClientDispatcher()
        let bCalled = false
        hub.add('a', {DeviceChange: () => {
            throw new Error('boom')
        }})
        hub.add('b', {DeviceChange: () => {
            bCalled = true
        }})

        expect(() => hub.dispatch('DeviceChange', '', {})).not.toThrow()
        expect(bCalled).toBe(true)
    })

    it('does nothing for a type no connection handles', () => {
        const hub = new ClientDispatcher()
        hub.add('a', {DeviceChange: () => {
            throw new Error('should not be called')
        }})
        expect(() => hub.dispatch('UnhandledType', '', {})).not.toThrow()
    })
})
