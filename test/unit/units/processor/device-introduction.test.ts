import {beforeEach, describe, expect, it, vi} from 'vitest'
import {assignOriginGroup, saveIntroducedDevice, type IntroductionStore} from '../../../../lib/units/processor/device-introduction.ts'

const ROOT = {id: 'root', name: 'Common', class: 'bookable'}
const TEAM = {id: 'team', name: 'Team', class: 'bookable', users: []}

describe('device introduction', () => {
    let devices: Map<string, any>
    let groups: Map<string, any>
    let store: IntroductionStore
    let log: {error: ReturnType<typeof vi.fn>}

    beforeEach(() => {
        devices = new Map()
        groups = new Map([[ROOT.id, ROOT], [TEAM.id, TEAM], ['booking', {id: 'booking', class: 'once'}]])
        log = {error: vi.fn()}

        // In-memory stand-in with the same semantics as the Mongo models
        store = {
            saveDeviceInitialState: vi.fn(async(serial, device) => {
                const existing = devices.get(serial)
                devices.set(serial, existing ?
                    {...existing, ...device} :
                    {...device, group: {id: ROOT.id, origin: ROOT.id, name: ROOT.name, originName: ROOT.name}})
            }),
            getGroup: vi.fn(async id => groups.get(id) ?? null),
            // Mongo returns a snapshot, not a live document
            loadDeviceBySerial: vi.fn(async serial => structuredClone(devices.get(serial)) ?? null),
            isUpdateDeviceOriginGroupAllowed: vi.fn(async() => true),
            updateDevicesOriginGroup: vi.fn(async(serial, group) => {
                const device = devices.get(serial)
                device.group = {...device.group, origin: group.id, originName: group.name}
            }),
            updateDevicesCurrentGroupFromOrigin: vi.fn(async serial => {
                const device = devices.get(serial)
                const group = groups.get(device.group.origin)
                device.group = {...device.group, id: group.id, name: group.name}
            })
        }
    })

    it('keeps a device without groupId in Common', async() => {
        await saveIntroducedDevice(store, log, {serial: 's1', silent: false})
        expect(devices.get('s1').group).toMatchObject({id: 'root', origin: 'root'})
        expect(store.getGroup).not.toHaveBeenCalled()
    })

    it('places a new device into the requested group', async() => {
        await saveIntroducedDevice(store, log, {serial: 's1', groupId: 'team'})
        expect(devices.get('s1').group).toMatchObject({id: 'team', origin: 'team', originName: 'Team'})
        expect(log.error).not.toHaveBeenCalled()
    })

    it('never stores groupId as a device property', async() => {
        await saveIntroducedDevice(store, log, {serial: 's1', groupId: 'team'})
        expect(store.saveDeviceInitialState).toHaveBeenCalledWith('s1', {serial: 's1'})
        expect(devices.get('s1')).not.toHaveProperty('groupId')
    })

    it('does not touch a device already in the group', async() => {
        await saveIntroducedDevice(store, log, {serial: 's1', groupId: 'team'})
        vi.mocked(store.updateDevicesOriginGroup).mockClear()

        await saveIntroducedDevice(store, log, {serial: 's1', groupId: 'team'})
        expect(store.updateDevicesOriginGroup).not.toHaveBeenCalled()
    })

    it('keeps the current booking when moving the origin', async() => {
        devices.set('s1', {serial: 's1', group: {id: 'booking', origin: 'root'}})
        expect(await assignOriginGroup(store, log, 's1', 'team')).toBe(true)
        expect(devices.get('s1').group).toMatchObject({id: 'booking', origin: 'team'})
    })

    it.each([
        ['an unknown group', 'missing', /not an origin group/],
        ['a transient group', 'booking', /not an origin group/]
    ])('refuses %s', async(_, groupId, error) => {
        await saveIntroducedDevice(store, log, {serial: 's1', groupId})
        expect(devices.get('s1').group).toMatchObject({id: 'root', origin: 'root'})
        expect(log.error).toHaveBeenCalledWith(expect.stringMatching(error), 's1', groupId)
    })

    it('refuses to move a booked device', async() => {
        vi.mocked(store.isUpdateDeviceOriginGroupAllowed).mockResolvedValueOnce(false)
        await saveIntroducedDevice(store, log, {serial: 's1', groupId: 'team'})
        expect(devices.get('s1').group.origin).toBe('root')
        expect(log.error).toHaveBeenCalledWith(expect.stringMatching(/booked/), 's1', 'team')
    })

    it('still registers the device when the group lookup fails', async() => {
        vi.mocked(store.getGroup).mockRejectedValueOnce(new Error('db down'))
        await expect(saveIntroducedDevice(store, log, {serial: 's1', groupId: 'team'})).resolves.toBeUndefined()
        expect(devices.has('s1')).toBe(true)
        expect(log.error).toHaveBeenCalledWith(expect.any(String), 's1', 'team', 'db down')
    })
})
