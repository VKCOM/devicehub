import {afterEach, describe, expect, it, vi} from 'vitest'
import {SilentDeviceRuntime} from '../../../../lib/units/base-device/support/silent-runtime.js'
import {InactivityMonitor} from '../../../../lib/util/inactivity-monitor.js'
import {Any} from '../../../../lib/wire/google/protobuf/any.js'
import {DeviceReadyMessage, InitializeIosDeviceState, SizeIosDevice, DeviceIdentityMessage, DeviceStatus} from '../../../../lib/wire/wire.js'

const deferred = () => {
    let resolve!: () => void
    const promise = new Promise<void>(r => { resolve = r })
    return {promise, resolve}
}
const actor = (email = 'owner@example.com') => ({email, name: email, group: 'user-channel', adbKeys: ['key']})
const closing: SilentDeviceRuntime[] = []
afterEach(async () => { await Promise.all(closing.splice(0).map(runtime => runtime.close())); vi.useRealTimers() })

function device(allowed: string[] = [], platform = 'Android') {
    const publish = vi.fn()
    const runtime = new SilentDeviceRuntime('provider', 'serial', allowed, publish, new InactivityMonitor(), 1000)
    closing.push(runtime)
    const group = {joinExclusive: vi.fn(async () => {}), leaveExclusive: vi.fn(async () => {})}
    runtime.bindGroup(group)
    if (platform === 'iOS') {
        runtime.observe(Any.pack(InitializeIosDeviceState.create({serial: 'serial', status: DeviceStatus.ONLINE,
            options: {name: 'iPhone', platform: 'iOS', sdk: '18', marketName: 'iPhone', architecture: 'arm64', service: {hasAPNS: true}}}), InitializeIosDeviceState))
        runtime.observe(Any.pack(SizeIosDevice.create({url: 'ws://screen', width: 300, height: 600}), SizeIosDevice))
    }
    else runtime.observe(Any.pack(DeviceIdentityMessage.create({serial: 'serial', platform, manufacturer: 'Google', display: {url: 'ws://screen'}}), DeviceIdentityMessage))
    runtime.observe(Any.pack({serial: 'serial', channel: 'channel'}, DeviceReadyMessage))
    return {runtime, group, publish}
}

describe('silent runtime', () => {
    it('describes Android and iOS from local state without acquiring or exposing credentials', () => {
        for (const platform of ['Android', 'iOS']) {
            const {runtime, group} = device([], platform)
            const snapshot = runtime.describe(actor())
            expect(snapshot).toMatchObject({platform, ready: true, provider: {name: 'provider'}, owner: null})
            if (platform === 'iOS') expect(snapshot.manufacturer).toBe('Apple')
            expect(snapshot).not.toHaveProperty('leaseId')
            expect(snapshot).not.toHaveProperty('group')
            expect(group.joinExclusive).not.toHaveBeenCalled()
        }
    })

    it('checks ACL for both description and acquisition, including admins supplied as ordinary actors', async () => {
        const {runtime} = device(['owner@example.com'])
        expect(() => runtime.describe(actor('other@example.com'))).toThrow('forbidden')
        await expect(runtime.acquire(actor('other@example.com'), runtime.instanceId)).rejects.toThrow('forbidden')
        await expect(runtime.acquire(actor(), 'old-instance')).rejects.toThrow('stale_instance')
    })

    it('reserves atomically, waits for platform readiness, and rejects a competing user', async () => {
        const {runtime, group} = device()
        const preparation = deferred()
        group.joinExclusive.mockImplementation(() => preparation.promise)
        const pending = runtime.acquire(actor(), runtime.instanceId)
        const retry = runtime.acquire(actor(), runtime.instanceId)
        expect(() => runtime.authorize({instanceId: runtime.instanceId, leaseId: ''})).toThrow('not_owner')
        await expect(runtime.acquire(actor('other'), runtime.instanceId)).rejects.toThrow('busy')
        preparation.resolve()
        const lease = await pending
        expect(lease.device.using).toBe(true)
        expect((await retry).leaseId).toBe(lease.leaseId)
        expect(group.joinExclusive).toHaveBeenCalledTimes(1)
        runtime.authorize(lease)
    })

    it('revokes before async cleanup, rejects stale commands, and waits before allowing another owner', async () => {
        const {runtime, group} = device()
        const lease = await runtime.acquire(actor(), runtime.instanceId)
        const cleanup = deferred()
        group.leaveExclusive.mockImplementationOnce(() => cleanup.promise)
        const releasing = runtime.release()
        expect(() => runtime.authorize(lease)).toThrow('not_owner')
        await expect(runtime.acquire(actor('other'), runtime.instanceId)).rejects.toThrow('busy')
        cleanup.resolve()
        await releasing
        const next = await runtime.acquire(actor('other'), runtime.instanceId)
        expect(next.leaseId).not.toBe(lease.leaseId)
        expect(() => runtime.authorize(lease)).toThrow('not_owner')
    })

    it('rolls back a failed platform start', async () => {
        const {runtime, group} = device()
        group.joinExclusive.mockRejectedValueOnce(new Error('WDA failed'))
        await expect(runtime.acquire(actor(), runtime.instanceId)).rejects.toThrow('WDA failed')
        expect(group.leaveExclusive).toHaveBeenCalledWith('acquire_failed')
        expect(runtime.describe(actor()).owner).toBeNull()
        await expect(runtime.acquire(actor('other'), runtime.instanceId)).resolves.toHaveProperty('leaseId')
    })

    it('does not renew the lease when another allowed user describes the device', async () => {
        vi.useFakeTimers()
        const {runtime, group} = device()
        await runtime.acquire(actor(), runtime.instanceId)
        await vi.advanceTimersByTimeAsync(800)
        runtime.describe(actor('viewer'))
        await vi.advanceTimersByTimeAsync(300)
        expect(group.leaveExclusive).toHaveBeenCalledWith('timeout')
    })

    it('runs no timer without an owner and expires exactly one idle lease after acquisition', async () => {
        vi.useFakeTimers()
        const {runtime, group} = device()
        expect(vi.getTimerCount()).toBe(0)
        await vi.advanceTimersByTimeAsync(125)
        await runtime.acquire(actor(), runtime.instanceId)
        expect(vi.getTimerCount()).toBe(1)
        await vi.advanceTimersByTimeAsync(999)
        expect(group.leaveExclusive).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
        expect(group.leaveExclusive).toHaveBeenCalledExactlyOnceWith('timeout')
        expect(vi.getTimerCount()).toBe(0)
    })

    it('extends the idle deadline on commands without releasing at the previous deadline', async () => {
        vi.useFakeTimers()
        const {runtime, group} = device()
        const lease = await runtime.acquire(actor(), runtime.instanceId)
        await vi.advanceTimersByTimeAsync(750)
        runtime.authorize(lease)
        await vi.advanceTimersByTimeAsync(999)
        expect(group.leaveExclusive).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(1)
        await vi.advanceTimersByTimeAsync(1)
        expect(group.leaveExclusive).toHaveBeenCalledExactlyOnceWith('timeout')
        expect(vi.getTimerCount()).toBe(0)
    })

    it('cancels the timer before awaiting release cleanup', async () => {
        vi.useFakeTimers()
        const {runtime, group} = device()
        await runtime.acquire(actor(), runtime.instanceId)
        const cleanup = deferred()
        group.leaveExclusive.mockImplementationOnce(() => cleanup.promise)
        const releasing = runtime.release()
        try {
            expect(vi.getTimerCount()).toBe(0)
            await vi.advanceTimersByTimeAsync(5000)
            expect(group.leaveExclusive).toHaveBeenCalledExactlyOnceWith('ungroup_request')
        }
        finally { cleanup.resolve() }
        await releasing
        await runtime.acquire(actor('next'), runtime.instanceId)
        await runtime.close()
        expect(vi.getTimerCount()).toBe(0)
    })

    it('does not start a lease timer when shutdown overlaps acquisition', async () => {
        vi.useFakeTimers()
        const {runtime, group} = device()
        const preparation = deferred()
        group.joinExclusive.mockImplementationOnce(() => preparation.promise)
        const acquiring = expect(runtime.acquire(actor(), runtime.instanceId)).rejects.toThrow('session_ended')
        const closing = runtime.close()
        preparation.resolve()
        await Promise.all([acquiring, closing])
        expect(group.leaveExclusive).toHaveBeenCalledExactlyOnceWith('device_absent')
        expect(vi.getTimerCount()).toBe(0)
    })

    it('does not acquire again while releases queued during preparation are cleaning up', async () => {
        const {runtime, group} = device()
        const preparation = deferred(), cleanup = deferred()
        group.joinExclusive.mockImplementationOnce(() => preparation.promise)
        group.leaveExclusive.mockImplementationOnce(() => cleanup.promise)
        const first = expect(runtime.acquire(actor(), runtime.instanceId)).rejects.toThrow('session_ended')
        const release = runtime.release(), repeatedRelease = runtime.release()
        const retry = expect(runtime.acquire(actor(), runtime.instanceId)).rejects.toThrow('busy')
        preparation.resolve()
        await first
        await retry
        expect(group.leaveExclusive).toHaveBeenCalledTimes(1)
        cleanup.resolve()
        await Promise.all([release, repeatedRelease])
    })

    it('keeps a device unavailable after failed cleanup despite later state events', async () => {
        const {runtime, group} = device()
        await runtime.acquire(actor(), runtime.instanceId)
        group.leaveExclusive.mockRejectedValueOnce(new Error('cleanup failed'))
        await expect(runtime.release()).rejects.toThrow('cleanup failed')
        runtime.observe(Any.pack({serial: 'serial', channel: 'channel'}, DeviceReadyMessage))
        expect(runtime.describe(actor()).ready).toBe(false)
        await expect(runtime.acquire(actor(), runtime.instanceId)).rejects.toThrow('not_ready')
    })

    it('rejects new acquisitions after shutdown', async () => {
        const {runtime} = device()
        await runtime.close()
        await expect(runtime.acquire(actor(), runtime.instanceId)).rejects.toThrow('device_absent')
    })
})
