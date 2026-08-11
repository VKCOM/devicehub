import {describe, it, expect, vi, beforeEach} from 'vitest'
import {OwnershipCache, type OwnedDevice} from '../../../../lib/units/websocket/support/ownershipCache.ts'

const makeDevices = (...serials: string[]): OwnedDevice[] =>
    serials.map((serial, i) => ({serial, providerName: `provider-${i}`}))

describe('OwnershipCache', () => {
    let clock: number

    beforeEach(() => {
        clock = Date.now()
        vi.useFakeTimers()
        vi.setSystemTime(clock)
    })

    it('returns loaded devices on first call', async () => {
        const cache = new OwnershipCache(10_000)
        const loader = vi.fn().mockResolvedValue(makeDevices('s1', 's2'))

        const result = await cache.get('user@a', loader)
        expect(result).toEqual(makeDevices('s1', 's2'))
        expect(loader).toHaveBeenCalledOnce()
    })

    it('serves from cache on second call within TTL (loader not called again)', async () => {
        const cache = new OwnershipCache(10_000)
        const loader = vi.fn().mockResolvedValue(makeDevices('s1'))

        await cache.get('user@a', loader)
        vi.advanceTimersByTime(5_000)
        const result = await cache.get('user@a', loader)

        expect(result).toEqual(makeDevices('s1'))
        expect(loader).toHaveBeenCalledOnce()
    })

    it('calls loader again after TTL expires', async () => {
        const cache = new OwnershipCache(10_000)
        const loader = vi.fn()
            .mockResolvedValueOnce(makeDevices('s1'))
            .mockResolvedValueOnce(makeDevices('s1', 's2'))

        await cache.get('user@a', loader)
        vi.advanceTimersByTime(10_001)
        const result = await cache.get('user@a', loader)

        expect(result).toEqual(makeDevices('s1', 's2'))
        expect(loader).toHaveBeenCalledTimes(2)
    })

    it('invalidate forces a fresh load on next call', async () => {
        const cache = new OwnershipCache(10_000)
        const loader = vi.fn()
            .mockResolvedValueOnce(makeDevices('s1'))
            .mockResolvedValueOnce([])

        await cache.get('user@a', loader)
        cache.invalidate('user@a')
        const result = await cache.get('user@a', loader)

        expect(result).toEqual([])
        expect(loader).toHaveBeenCalledTimes(2)
    })

    it('keeps separate entries per email', async () => {
        const cache = new OwnershipCache(10_000)
        const loaderA = vi.fn().mockResolvedValue(makeDevices('s1'))
        const loaderB = vi.fn().mockResolvedValue(makeDevices('s2'))

        const [a, b] = await Promise.all([
            cache.get('a@x', loaderA),
            cache.get('b@x', loaderB),
        ])

        expect(a[0].serial).toBe('s1')
        expect(b[0].serial).toBe('s2')
    })
})
