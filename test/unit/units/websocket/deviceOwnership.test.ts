import {describe, it, expect} from 'vitest'
import {DeviceOwnership} from '../../../../lib/units/websocket/support/deviceOwnership.ts'

// Under the ROUTER/DEALER model a websocket client addresses a device by its
// raw serial (not a sha1 channel). Each connection tracks which serials it owns
// and caches the provider.name needed to route commands to them.
describe('DeviceOwnership', () => {
    it('is not owned until claimed', () => {
        const own = new DeviceOwnership()
        expect(own.isOwned('serial-1')).toBe(false)
    })

    it('claims a serial with its provider and reports ownership', () => {
        const own = new DeviceOwnership()
        own.claim('serial-1', 'provider-a')
        expect(own.isOwned('serial-1')).toBe(true)
        expect(own.providerOf('serial-1')).toBe('provider-a')
    })

    it('releases a claimed serial', () => {
        const own = new DeviceOwnership()
        own.claim('serial-1', 'provider-a')
        own.release('serial-1')
        expect(own.isOwned('serial-1')).toBe(false)
        expect(own.providerOf('serial-1')).toBeUndefined()
    })

    it('keeps a provider hint without granting ownership (for lazy resolution)', () => {
        const own = new DeviceOwnership()
        own.rememberProvider('serial-1', 'provider-a')
        // Remembering the provider must not imply ownership.
        expect(own.isOwned('serial-1')).toBe(false)
        expect(own.providerOf('serial-1')).toBe('provider-a')
    })

    it('tracks multiple serials independently', () => {
        const own = new DeviceOwnership()
        own.claim('s1', 'p1')
        own.claim('s2', 'p2')
        own.release('s1')
        expect(own.isOwned('s1')).toBe(false)
        expect(own.isOwned('s2')).toBe(true)
        expect(own.providerOf('s2')).toBe('p2')
    })
})
