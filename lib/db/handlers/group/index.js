import timeutil from '../../../util/timeutil.js'
import apiutil from '../../../util/apiutil.js'
import logger from '../../../util/logger.js'
import wireutil from '../../../wire/util.js'
import wire from '../../../wire/index.js'
import dbapi from '../../api.js'
import GroupsScheduler from './scheduler.js'
import {GroupChangeMessage, GroupField, UngroupMessage} from '../../../wire/wire.js'

class GroupChangeHandler {

    /** @type {GroupsScheduler} */
    // @ts-ignore
    scheduler
    isPrepared = false
    log = logger.createLogger('change-handler-groups')

    /**
     * @param {import('../../../wire/app-transport.js').AppTransport} transport
     * @param {import('../../../wire/transmanager.js').TransactionManager=} txmanager
     */
    init(transport, txmanager) {
        this.transport = transport
        this.txmanager = txmanager
        this.isPrepared = !!this.transport && !!this.txmanager
    }

    async initScheduler() {
        if (this.isPrepared) {
            this.scheduler = new GroupsScheduler()
            await this.scheduler.init()
        }
    }

    // Run an Ungroup transaction to release control of the device.
    // Device is addressed by (provider.name, serial); transaction resolution confirms release.
    sendReleaseDeviceControl = async(serial) => {
        this.scheduler?.scheduleAllGroupsTasks()
        const device = await dbapi.loadDeviceBySerial(serial)
        if (!device?.provider?.name) {
            this.log.warn('Cannot release control of %s: no provider', serial)
            return
        }
        try {
            await this.txmanager.runTransaction(device.provider.name, serial, UngroupMessage, {
                requirements: wireutil.toDeviceRequirements({
                    serial: {
                        value: serial,
                        match: 'exact'
                    }
                })
            }, {timeout: 5000})
        }
        catch (err) {
            this.log.warn('Release control transaction for %s failed: %s', serial, err?.message)
        }
    }

    sendGroupChange = (group, subscribers, isChangedDates, isChangedClass, isAddedUser, users, isAddedDevice, devices, action) => {
        this.scheduler?.scheduleAllGroupsTasks()

        const dates = group.dates.map(date => ({
            start: date.start.toJSON(),
            stop: date.stop.toJSON()
        }))

        this.transport.sendBroadcast(
            wireutil.pack(GroupChangeMessage, {
                group: GroupField.create({
                    id: group.id,
                    name: group.name,
                    class: group.class,
                    privilege: group.privilege,
                    owner: group.owner,
                    dates: dates,
                    duration: group.duration,
                    repetitions: group.repetitions,
                    devices: group.devices,
                    users: group.users,
                    state: group.state,
                    isActive: group.isActive,
                    moderators: group.moderators,
                }),
                action: action,
                subscribers: subscribers,
                isChangedDates: isChangedDates,
                isChangedClass: isChangedClass,
                isAddedUser: isAddedUser,
                users: users,
                isAddedDevice: isAddedDevice,
                devices: devices,
                timeStamp: timeutil.now('nano')
            })
        )
    }

    sendGroupUsersChange = (group, users, devices, isAdded, action) => {
        this.scheduler?.scheduleAllGroupsTasks()

        this.transport.sendBroadcast(
            wireutil.envelope(new wire.GroupUserChangeMessage(
                users, isAdded, group.id
                , action === 'GroupDeletedLater'
                , devices
            ))
        )
    }

    doUpdateDeviceOriginGroup = async(group, serial, signature) => {
        this.scheduler?.scheduleAllGroupsTasks()

        const result = await dbapi.updateDevicesOriginGroup(serial, group)
        if (result) {
            this.transport.sendBroadcast(
                wireutil.envelope(new wire.DeviceOriginGroupMessage(signature))
            )
        }

        return result
    }

    doUpdateDevicesCurrentGroup = (group, devices = []) =>
        dbapi.updateDevicesCurrentGroup(devices, group)
            .then(() => this.scheduler?.scheduleAllGroupsTasks())

    doUpdateDevicesCurrentGroupFromOrigin = (devices = []) =>
        dbapi.updateDevicesCurrentGroupFromOrigin(devices)
            .then(() => this.scheduler?.scheduleAllGroupsTasks())

    doUpdateDevicesGroupName = (group) =>
        Promise.all(group.devices?.map(serial => dbapi.updateDeviceGroupName(serial, group)))
            .then(() => this.scheduler?.scheduleAllGroupsTasks())

    doUpdateDevicesCurrentGroupDates = (group) => {
        this.scheduler?.scheduleAllGroupsTasks()

        if (apiutil.isOriginGroup(group.class)) {
            return Promise.all(group.devices?.map(serial =>
                dbapi.loadDeviceBySerial(serial).then(device =>
                    device.group.id === group.id && this.doUpdateDevicesCurrentGroup(group, [serial])
                )
            ))
        }

        return Promise.all(group.devices?.map(serial =>
            this.doUpdateDevicesCurrentGroup(group, [serial])
        ))
    }

    treatGroupUsersChange = (group, users, isActive, isAddedUser) => {
        this.scheduler?.scheduleAllGroupsTasks()

        if (!isActive) {
            return this.sendGroupUsersChange(group, users, [], isAddedUser, 'GroupUser(s)Updated')
        }
        return Promise.all(users?.map(async(email) => {
            const devices = await Promise.all(group.devices?.map(
                async(serial) => {
                    const device = await dbapi.loadDeviceBySerial(serial)
                    if (!device || device.group.id !== group.id) {
                        return null
                    }
                    if (isAddedUser || !device.owner || device.owner.email !== email) {
                        return serial
                    }

                    // The user is losing control of this device: run the Ungroup transaction.
                    await this.sendReleaseDeviceControl(serial)
                    return serial
                }
            ))

            this.sendGroupUsersChange(
                group
                , [email]
                , devices.filter(d => !!d)
                , isAddedUser
                , 'GroupUser(s)Updated'
            )
        }))
    }

    treatGroupDevicesChange = async(oldGroup, group, devices, isAddedDevice) => {
        this.scheduler?.scheduleAllGroupsTasks()

        if (!group?.isActive || !apiutil.isOriginGroup(group?.class)) {
            return
        }

        if (isAddedDevice) {
            return this.doUpdateDevicesCurrentGroup(group, devices)
        }

        await this.doUpdateDevicesCurrentGroupFromOrigin(devices)
        if (group === null) {
            return this.sendGroupUsersChange(oldGroup, oldGroup.users, [], false, 'GroupDeletedLater')
        }
    }

    treatGroupDeletion = async(group) => {
        this.scheduler?.scheduleAllGroupsTasks()

        if (!apiutil.isOriginGroup(group.class)) {
            return this.sendGroupUsersChange(group, group.users, [], false, 'GroupDeleted')
        }

        dbapi.updateDevicesCurrentGroupFromOrigin(group.devices)
        return this.sendGroupUsersChange(group, group.users, [], false, 'GroupDeletedLater')
    }
}

// Proxy that no-ops all methods if the handler was not initialized,
// preventing errors when units use the db module without transport.
/** @type {GroupChangeHandler} */
export default new Proxy(new GroupChangeHandler(), {

    /** @param {string} prop */
    get(target, prop) {
        if (target.isPrepared || prop === 'init' || typeof target[prop] !== 'function') {
            return target[prop]
        }

        return () => {}
    }
})
