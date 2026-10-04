import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {InactivityMonitor} from '../../../../lib/util/inactivity-monitor.js'
import {SilentDeviceRuntime} from '../../../../lib/units/base-device/support/silent-runtime.js'
import {WireRouter} from '../../../../lib/wire/router.js'
import {Any} from '../../../../lib/wire/google/protobuf/any.js'
import {DeviceIdentityMessage, DeviceReadyMessage, ShellCommandMessage} from '../../../../lib/wire/wire.js'
import wireutil from '../../../../lib/wire/util.js'

vi.mock('../../../../lib/units/base-device/support/router.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/base-device/support/transport.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/util/lifecycle.js', () => ({default: {observe: vi.fn()}}))
const {default: groupPlugin} = await import('../../../../lib/units/base-device/plugins/group.js')

const owner = {email: 'owner', name: 'owner', group: 'channel', adbKeys: []}
const closing: Array<() => unknown> = []
beforeEach(() => vi.useFakeTimers())
afterEach(async () => {
    for (const close of closing.splice(0)) await close()
    vi.useRealTimers()
    vi.clearAllMocks()
})

async function device(silent: boolean, timeout = 1000) {
    const inactivity = new InactivityMonitor()
    const runtime = silent ? new SilentDeviceRuntime('p', 's', [], vi.fn(), inactivity, timeout) : undefined
    const router = new WireRouter().on(ShellCommandMessage, () => {})
    const group = await groupPlugin.invoke({serial: 's', silent, groupTimeout: timeout}, router,
        {inactivity, silent: runtime, send: vi.fn()})
    closing.push(() => runtime ? runtime.close() : group.leave('device_absent'))
    let lease: {instanceId: string; leaseId: string} | undefined
    if (runtime) {
        runtime.observe(Any.pack(DeviceIdentityMessage.create({serial: 's', display: {url: 'ws://screen'}}), DeviceIdentityMessage))
        runtime.observe(Any.pack({serial: 's', channel: 'solo'}, DeviceReadyMessage))
        lease = await runtime.acquire(owner, runtime.instanceId)
    }
    else group.join(owner, timeout, 'debug', [])
    const command = () => {
        runtime?.authorize(lease)
        router.handler()('', Buffer.from(wireutil.pack(ShellCommandMessage, {command: 'true', timeout: 1000})))
    }
    return {group, runtime, lease, command}
}

describe.each([false, true])('shared worker inactivity (silent: %s)', silent => {
    it.each(['ui', 'adb'])('uses one timer, refreshed by %s activity', async source => {
        const h = await device(silent)
        const left = vi.fn()
        h.group.on('leave', left)
        expect(vi.getTimerCount()).toBe(1)
        await vi.advanceTimersByTimeAsync(750)
        if (source === 'ui') h.command()
        else h.group.keepalive()
        await vi.advanceTimersByTimeAsync(999)
        expect(left).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
        expect(left).toHaveBeenCalledTimes(1)
        expect(left.mock.calls[0][1]).toBe(silent ? 'timeout' : 'automatic_timeout')
        expect(vi.getTimerCount()).toBe(0)
        await expect(h.group.get()).rejects.toThrow()
        if (h.runtime) {
            expect(h.runtime.describe(owner).owner).toBeNull()
            expect(() => h.runtime!.authorize(h.lease)).toThrow('not_owner')
        }
    })

    it.each([0, 1])('keeps ownership with the configured unlimited timeout %s', async timeout => {
        const h = await device(silent, timeout)
        await vi.advanceTimersByTimeAsync(86_400_000)
        expect(vi.getTimerCount()).toBe(0)
        await expect(h.group.get()).resolves.toMatchObject({email: owner.email})
        h.command()
    })
})

it('revokes the silent lease at idle expiry and waits for platform cleanup before reacquisition', async () => {
    const h = await device(true)
    let finish!: () => void
    const cleanup = new Promise<void>(resolve => { finish = resolve })
    h.group.once('leave', () => cleanup)
    await vi.advanceTimersByTimeAsync(1000)
    try {
        expect(() => h.runtime!.authorize(h.lease)).toThrow('not_owner')
        await expect(h.runtime!.acquire({...owner, email: 'next'}, h.runtime!.instanceId)).rejects.toThrow('busy')
        expect(vi.getTimerCount()).toBe(0)
    }
    finally { finish() }
    await h.runtime!.release()
    const next = await h.runtime!.acquire({...owner, email: 'next'}, h.runtime!.instanceId)
    expect(next.leaseId).not.toBe(h.lease!.leaseId)
    expect(vi.getTimerCount()).toBe(1)
})

it('preserves normal reacquisition and replaces the old deadline on takeover', async () => {
    const {group} = await device(false)
    const left = vi.fn()
    group.on('leave', left)
    await vi.advanceTimersByTimeAsync(750)
    group.join(owner, 100, 'debug', [])
    await vi.advanceTimersByTimeAsync(999)
    expect(left).not.toHaveBeenCalled()
    group.join({...owner, email: 'next'}, 500, 'debug', [])
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(499)
    expect(left).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(left).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({email: 'next'}), 'automatic_timeout')
})
