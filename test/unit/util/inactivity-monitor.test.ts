import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {InactivityMonitor} from '../../../lib/util/inactivity-monitor.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('inactivity monitor', () => {
    it('does not recreate timers on activity and fires once after the latest activity', async () => {
        const expired = vi.fn(), monitor = new InactivityMonitor()
        const schedule = vi.spyOn(globalThis, 'setTimeout')
        monitor.start(1000, expired)
        await vi.advanceTimersByTimeAsync(750)
        for (let i = 0; i < 1000; i++) monitor.keepalive()
        expect(schedule).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(999)
        expect(expired).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
        expect(expired).toHaveBeenCalledOnce()
        expect(vi.getTimerCount()).toBe(0)
        monitor.keepalive()
        await vi.advanceTimersByTimeAsync(1000)
        expect(expired).toHaveBeenCalledOnce()
    })

    it('cancels the previous session when stopped or restarted', async () => {
        const monitor = new InactivityMonitor(), old = vi.fn(), current = vi.fn()
        monitor.start(1000, old)
        await vi.advanceTimersByTimeAsync(900)
        monitor.start(1000, current)
        await vi.advanceTimersByTimeAsync(999)
        expect(old).not.toHaveBeenCalled()
        expect(current).not.toHaveBeenCalled()
        monitor.stop()
        await vi.advanceTimersByTimeAsync(1000)
        expect(current).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)
    })

    it.each([0, 1])('preserves unlimited timeout %s without an active timer', async timeout => {
        const monitor = new InactivityMonitor(), expired = vi.fn()
        monitor.start(timeout, expired)
        monitor.keepalive()
        await vi.advanceTimersByTimeAsync(86_400_000)
        expect(vi.getTimerCount()).toBe(0)
        expect(expired).not.toHaveBeenCalled()
    })

    it('supports deadlines beyond the Node timer limit without expiring early', async () => {
        const monitor = new InactivityMonitor(), expired = vi.fn()
        monitor.start(2_147_483_647 + 500, expired)
        await vi.advanceTimersByTimeAsync(2_147_483_647 + 499)
        expect(expired).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
        expect(expired).toHaveBeenCalledOnce()
    })
})
