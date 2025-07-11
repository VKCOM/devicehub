import timeutil from '../../../util/timeutil.js'
import apiutil from '../../../util/apiutil.js'
import wireutil from '../../../wire/util.js'
import wire from '../../../wire/index.js'
import dbapi from '../../api.js'
import GroupsScheduler from './scheduler.js'
import {WireRouter} from '../../../wire/router.js'

class GroupChangeHandler {

    /** @type {GroupsScheduler} */
    // @ts-ignore
    scheduler
    isPrepared = false

    init(push, pushdev, channelRouter) {
        this.push = push
        this.pushdev = pushdev
        this.channelRouter = channelRouter
        this.isPrepared = !!this.push && !!this.pushdev && !!this.channelRouter
    }

    async initScheduler() {
        if (this.isPrepared) {
            this.scheduler = new GroupsScheduler()
            await this.scheduler.init()
        }
    }

    sendReleaseDeviceControl = (serial, channel) => {
        this.scheduler?.scheduleAllGroupsTasks()
        this.push.send([
            channel,
            wireutil.envelope(new wire.UngroupMessage(wireutil.toDeviceRequirements({
                serial: {
                    value: serial,
                    match: 'exact'
                }
            })))
        ])
    }

    sendGroupChange = (group, subscribers, isChangedDates, isChangedClass, isAddedUser, users, isAddedDevice, devices, action) => {
        this.scheduler?.scheduleAllGroupsTasks()

        const dates = group.dates.map(date => ({
            start: date.start.toJSON(),
            stop: date.stop.toJSON()
        }))

        this.pushdev.send([
            wireutil.global,
            wireutil.envelope(new wire.GroupChangeMessage(
                new wire.GroupField(
                    group.id
                    , group.name
                    , group.class
                    , group.privilege
                    , group.owner
                    , dates
                    , group.duration
                    , group.repetitions
                    , group.devices
                    , group.users
                    , group.state
                    , group.isActive
                    , group.moderators
                )
                , action
                , subscribers
                , isChangedDates
                , isChangedClass
                , isAddedUser
                , users
                , isAddedDevice
                , devices
                , timeutil.now('nano')
            ))
        ])
    }

    sendGroupUsersChange = (group, users, devices, isAdded, action) => {
        this.scheduler?.scheduleAllGroupsTasks()

        this.pushdev.send([
            wireutil.global,
            wireutil.envelope(new wire.GroupUserChangeMessage(
                users, isAdded, group.id
                , action === 'GroupDeletedLater'
                , devices
            ))
        ])
    }

    doUpdateDeviceOriginGroup = async(group) => {
        this.scheduler?.scheduleAllGroupsTasks()

        await dbapi.updateDevicesOriginGroup(group.ticket.serial, group)
        this.push.send([
            wireutil.global,
            wireutil.envelope(new wire.DeviceOriginGroupMessage(group.ticket.signature))
        ])
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
                serial => new Promise(async(resolve) => {
                    const device = await dbapi.loadDeviceBySerial(serial)
                    if (!device || device.group.id !== group.id) {
                        return null
                    }
                    if (isAddedUser || !device.owner || device.owner.email !== email) {
                        return serial
                    }

                    const listener = new WireRouter()
                        .on(wire.LeaveGroupMessage, (channel, message) => {
                            if (message.serial === serial &&
                                message.owner.email === email) {
                                clearTimeout(responseTimer)
                                this.channelRouter.removeListener(wireutil.global, listener)
                                resolve(serial)
                            }
                        })
                        .handler()

                    const responseTimer = setTimeout(() => {
                        this.channelRouter.removeListener(wireutil.global, listener)
                        resolve(serial)
                    }, 5000)

                    this.channelRouter.on(wireutil.global, listener)
                    this.sendReleaseDeviceControl(serial, device.channel)
                })
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

// Temporary solution needed to avoid situations
// where a unit may not initialize the change handler,
// but use the db module. In this case, any methods of this handler
// do nothing and will not cause an error.
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
