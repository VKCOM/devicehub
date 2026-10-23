import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createAccessTokenCheck} from '../../../lib/util/access-token-check.ts'

describe('access token check', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('looks a token up once per TTL and sees its revocation after it', async() => {
        const tokens = new Set(['t1'])
        const exists = vi.fn(async(id: string) => tokens.has(id))
        const check = createAccessTokenCheck(exists, {ttlMs: 120_000})

        expect(await check('t1')).toBe(true)
        tokens.delete('t1')
        vi.advanceTimersByTime(119_000)
        expect(await check('t1')).toBe(true)
        expect(exists).toHaveBeenCalledTimes(1)

        vi.advanceTimersByTime(1_000)
        expect(await check('t1')).toBe(false)
        expect(exists).toHaveBeenCalledTimes(2)
    })

    it('shares one lookup between concurrent checks', async() => {
        const exists = vi.fn(async() => true)
        const check = createAccessTokenCheck(exists)

        expect(await Promise.all([check('t1'), check('t1'), check('t1')])).toEqual([true, true, true])
        expect(exists).toHaveBeenCalledTimes(1)
    })

    it('does not cache a failed lookup', async() => {
        const exists = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(true)
        const check = createAccessTokenCheck(exists)

        await expect(check('t1')).rejects.toThrow('db down')
        expect(await check('t1')).toBe(true)
    })

    it('forgets the least recently looked up token beyond its size', async() => {
        const exists = vi.fn(async() => true)
        const check = createAccessTokenCheck(exists, {maxSize: 2})

        await check('t1')
        await check('t2')
        await check('t3')
        await check('t2')
        expect(exists).toHaveBeenCalledTimes(3)
        await check('t1')
        expect(exists).toHaveBeenCalledTimes(4)
    })
})
