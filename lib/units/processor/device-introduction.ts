import GroupModel from '../../db/models/group/index.js'
import DeviceModel from '../../db/models/device/index.js'
import dbapi from '../../db/models/all/index.js'
import {isOriginGroup} from '../../util/apiutil.js'

interface Logger {
    error: (...args: any[]) => void
}

/* Database access used to register a device, injectable for tests */
export interface IntroductionStore {
    saveDeviceInitialState: (serial: string, device: Record<string, any>) => Promise<unknown>
    getGroup: (id: string) => Promise<any>
    loadDeviceBySerial: (serial: string) => Promise<any>
    isUpdateDeviceOriginGroupAllowed: (serial: string, group: any) => Promise<boolean>
    updateDevicesOriginGroup: (serial: string, group: any) => Promise<unknown>
    updateDevicesCurrentGroupFromOrigin: (serial: string) => Promise<unknown>
}

export const defaultStore: IntroductionStore = {
    saveDeviceInitialState: (serial, device) => dbapi.saveDeviceInitialState(serial, device),
    getGroup: id => GroupModel.getGroup(id),
    loadDeviceBySerial: serial => DeviceModel.loadDeviceBySerial(serial),
    isUpdateDeviceOriginGroupAllowed: (serial, group) => GroupModel.isUpdateDeviceOriginGroupAllowed(serial, group),
    updateDevicesOriginGroup: (serial, group) => dbapi.updateDevicesOriginGroup(serial, group),
    updateDevicesCurrentGroupFromOrigin: serial => dbapi.updateDevicesCurrentGroupFromOrigin(serial)
}

/*
 * Place a device into the origin group requested by its provider (provider API).
 * Returns whether the device ended up in that group. Failures only get logged:
 * the device stays in its current group.
 */
export const assignOriginGroup = async(store: IntroductionStore, log: Logger, serial: string, groupId: string) => {
    const group = await store.getGroup(groupId)
    if (!group || !isOriginGroup(group.class)) {
        log.error('Unable to place device "%s" into group "%s": not an origin group', serial, groupId)
        return false
    }

    const device = await store.loadDeviceBySerial(serial)
    if (device?.group?.origin === groupId) {
        return true
    }

    if (!await store.isUpdateDeviceOriginGroupAllowed(serial, group)) {
        log.error('Unable to place device "%s" into group "%s": device is booked', serial, groupId)
        return false
    }

    // Decided before the update: a booked device keeps its current group
    const inBooking = !!device?.group?.id && device.group.id !== device.group.origin

    await store.updateDevicesOriginGroup(serial, group)

    if (!inBooking) {
        await store.updateDevicesCurrentGroupFromOrigin(serial)
    }

    return true
}

/* Persist a non-silent device introduction and apply the requested origin group */
export const saveIntroducedDevice = async(
    store: IntroductionStore,
    log: Logger,
    message: {serial: string, groupId?: string} & Record<string, any>
) => {
    // groupId is a registration instruction, not a device property
    const {groupId, ...device} = message
    await store.saveDeviceInitialState(message.serial, device)

    if (groupId) {
        await assignOriginGroup(store, log, message.serial, groupId).catch((err: any) =>
            log.error('Unable to place device "%s" into group "%s": %s', message.serial, groupId, err?.message)
        )
    }
}
