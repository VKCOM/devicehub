import {beforeEach, describe, expect, it, vi} from 'vitest'
import {deviceSerial} from '../../../../lib/units/provider/ADBObserver.ts'
import {ConflictError, RemoteDeviceManager} from '../../../../lib/units/provider/remote-devices/manager.ts'
import {parseConnectRequest} from '../../../../lib/units/provider/remote-devices/request.ts'
import {WebhookHub} from '../../../../lib/units/provider/remote-devices/webhooks.ts'

/* ADBObserver stand-in: `connect` makes the device appear in the `appearAs` state */
const fakeTracker = () => {
    const devices = new Map<string, {serial: string, type: string}>()
    const tracker = {
        devices,
        appearAs: 'device',
        getDevice: (serial: string) => devices.get(serial),
        setAutoReconnect: vi.fn(),
        connect: vi.fn(async(host: string, port: number) => {
            const serial = deviceSerial(host, port)
            devices.set(serial, {serial, type: tracker.appearAs})
            return serial
        }),
        disconnect: vi.fn(async(host: string, port: number) => { devices.delete(deviceSerial(host, port)) })
    }
    return tracker
}

describe('RemoteDeviceManager', () => {
    let tracker: ReturnType<typeof fakeTracker>
    let webhooks: WebhookHub
    let removeWorker: ReturnType<typeof vi.fn>
    let manager: RemoteDeviceManager

    const request = (body: Record<string, unknown> = {}) =>
        parseConnectRequest({host: '10.0.0.5', port: 5555, webhook: 'http://hook', ...body})

    const events = () => vi.mocked(webhooks.emit).mock.calls.map(([serial, event, data]) => ({serial, event, data}))

    beforeEach(() => {
        tracker = fakeTracker()
        webhooks = new WebhookHub('p1', 1000, vi.fn(async() => new Response(null)) as any)
        vi.spyOn(webhooks, 'emit')
        removeWorker = vi.fn(async() => {})
        manager = new RemoteDeviceManager({
            providerName: 'p1', tracker: tracker as any, removeWorker, connectTimeoutMs: 300, webhooks
        })
    })

    it('connects a device and reports it once usable', async() => {
        const device = manager.connect(request({silent: true, emails: ['a@x'], idleTtl: 60}))
        expect(device).toMatchObject({serial: '10.0.0.5:5555', state: 'connecting'})
        expect(tracker.setAutoReconnect).toHaveBeenCalledWith('10.0.0.5:5555', false)

        await vi.waitFor(() => expect(device.state).toBe('active'))
        expect(events()).toEqual([{serial: '10.0.0.5:5555', event: 'device.connected', data: undefined}])
        expect(manager.forkOverrides('10.0.0.5:5555')).toEqual({
            silent: true, silentAllowedEmail: ['a@x'], groupTimeout: 60, connectUrl: undefined, groupId: undefined,
            hideHeader: false
        })
    })

    it('passes the connect URL or command and hideHeader to the worker', () => {
        manager.connect(request({connectUrl: 'proxy:1234'}))
        manager.connect(request({host: '10.0.0.6', silent: true, hideHeader: true, connectCommand: 'custom-adb connect proxy:1'}))

        expect(manager.forkOverrides('10.0.0.5:5555')).toMatchObject({connectUrl: 'proxy:1234', hideHeader: false})
        expect(manager.forkOverrides('10.0.0.6:5555'))
            .toMatchObject({connectUrl: 'custom-adb connect proxy:1', hideHeader: true})
    })

    it('uses the adb serial of IPv6 hosts', async() => {
        expect(manager.connect(request({host: '::1'})).serial).toBe('[::1]:5555')
        expect(manager.disconnect('::1', 5555)).toBe('[::1]:5555')
    })

    it('refuses a device that is already connected', () => {
        manager.connect(request())
        expect(() => manager.connect(request())).toThrow(ConflictError)

        tracker.devices.set('10.0.0.6:5555', {serial: '10.0.0.6:5555', type: 'device'})
        expect(() => manager.connect(request({host: '10.0.0.6'}))).toThrow(ConflictError)
    })

    it('reports a failed adb connect once and forgets the device', async() => {
        tracker.connect.mockRejectedValueOnce(new Error('Connection refused'))
        manager.connect(request())

        await vi.waitFor(() => expect(manager.has('10.0.0.5:5555')).toBe(false))
        expect(events()).toEqual([
            {serial: '10.0.0.5:5555', event: 'device.connect_failed', data: {reason: 'Connection refused'}}
        ])
        expect(tracker.connect).toHaveBeenCalledTimes(1)
        expect(tracker.setAutoReconnect).toHaveBeenLastCalledWith('10.0.0.5:5555', true)
    })

    it('gives up on a device that never becomes usable', async() => {
        tracker.appearAs = 'offline'
        manager.connect(request())

        await vi.waitFor(() => expect(manager.has('10.0.0.5:5555')).toBe(false), {timeout: 2000})
        expect(events()).toEqual([
            {serial: '10.0.0.5:5555', event: 'device.connect_failed', data: {reason: 'device is "offline"'}}
        ])
        expect(tracker.disconnect).toHaveBeenCalledWith('10.0.0.5', 5555)
    })

    it('disconnects: reports, stops the worker, drops adb', async() => {
        const device = manager.connect(request())
        await vi.waitFor(() => expect(device.state).toBe('active'))

        expect(manager.disconnect('10.0.0.5', 5555)).toBe('10.0.0.5:5555')
        await vi.waitFor(() => expect(tracker.disconnect).toHaveBeenCalledWith('10.0.0.5', 5555))
        expect(removeWorker).toHaveBeenCalledWith('10.0.0.5:5555')
        expect(events().at(-1)).toEqual({serial: '10.0.0.5:5555', event: 'device.disconnected', data: {reason: 'api'}})
        expect(manager.disconnect('10.0.0.5', 5555)).toBeNull()
    })

    it('does not leave an orphan adb connection when removed while connecting', async() => {
        let finish!: () => void
        tracker.connect.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve('10.0.0.5:5555') }))
        manager.connect(request())
        manager.disconnect('10.0.0.5', 5555)
        finish()

        await vi.waitFor(() => expect(tracker.disconnect).toHaveBeenCalledTimes(2))
        expect(events().map(e => e.event)).toEqual(['device.disconnected'])
    })

    it('keeps a device it gives up on until adb has disconnected it', async() => {
        let disconnected!: () => void
        tracker.disconnect.mockImplementationOnce(() => new Promise<void>(resolve => { disconnected = resolve }))
        tracker.connect.mockRejectedValueOnce(new Error('failed to connect'))
        manager.connect(request())

        // adb still lists a timed out device as "offline": it must stay ours meanwhile
        await vi.waitFor(() => expect(manager.isReleasing('10.0.0.5:5555')).toBe(true))
        expect(manager.has('10.0.0.5:5555')).toBe(true)
        expect(tracker.setAutoReconnect).not.toHaveBeenCalledWith('10.0.0.5:5555', true)

        disconnected()
        await vi.waitFor(() => expect(manager.has('10.0.0.5:5555')).toBe(false))
        expect(manager.isReleasing('10.0.0.5:5555')).toBe(false)
        expect(tracker.setAutoReconnect).toHaveBeenLastCalledWith('10.0.0.5:5555', true)
    })

    it('releases once, however many times it is asked to', async() => {
        let disconnected!: () => void
        const device = manager.connect(request())
        await vi.waitFor(() => expect(device.state).toBe('active'))
        tracker.disconnect.mockImplementationOnce(() => new Promise<void>(resolve => { disconnected = resolve }))

        expect(manager.disconnect('10.0.0.5', 5555)).toBe('10.0.0.5:5555')
        expect(manager.disconnect('10.0.0.5', 5555)).toBe('10.0.0.5:5555')
        expect(await manager.deviceLost('10.0.0.5:5555', 'offline')).toBe(false)

        const shutdown = manager.shutdown()
        disconnected()
        await shutdown

        expect(removeWorker).toHaveBeenCalledTimes(1)
        expect(tracker.disconnect).toHaveBeenCalledTimes(1)
        expect(events().filter(e => e.event === 'device.disconnected').map(e => e.data)).toEqual([{reason: 'api'}])
        expect(manager.has('10.0.0.5:5555')).toBe(false)
    })

    it('handles a lost device only once it is established', async() => {
        const device = manager.connect(request())
        expect(await manager.deviceLost('10.0.0.5:5555', 'offline')).toBe(false)

        await vi.waitFor(() => expect(device.state).toBe('active'))
        expect(await manager.deviceLost('10.0.0.5:5555', 'offline', {state: 'offline'})).toBe(true)
        expect(events().at(-1)).toEqual({
            serial: '10.0.0.5:5555', event: 'device.disconnected', data: {reason: 'offline', state: 'offline'}
        })
        expect(manager.has('10.0.0.5:5555')).toBe(false)
        expect(await manager.deviceLost('10.0.0.5:5555', 'offline')).toBe(false)
    })

    it.each([
        ['automatic_timeout', 'idle_timeout'],
        ['timeout', 'idle_timeout'],
        ['ungroup_request', 'manual'],
        ['takeover', 'takeover']
    ])('reports release reason %s as %s', (reason, expected) => {
        manager.workerState('s', {state: 'idle', email: 'u@x', reason})
        expect(events()).toEqual([{serial: 's', event: 'device.released', data: {email: 'u@x', reason: expected}}])
    })

    it('reports acquisition', () => {
        manager.workerState('s', {state: 'busy', email: 'u@x'})
        expect(events()).toEqual([{serial: 's', event: 'device.acquired', data: {email: 'u@x'}}])
    })

    it('disconnects every device on shutdown', async() => {
        manager.connect(request())
        manager.connect(request({host: '10.0.0.6'}))
        await manager.shutdown()

        expect(manager.list()).toEqual([])
        expect(events().filter(e => e.event === 'device.disconnected').map(e => e.data))
            .toEqual([{reason: 'provider_shutdown'}, {reason: 'provider_shutdown'}])
    })
})
