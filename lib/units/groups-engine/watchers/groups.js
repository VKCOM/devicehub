/**
 * Copyright © 2023 contains code contributed by V Kontakte LLC, authors: Daniil Smirnov, Egor Platonov - Licensed under the Apache license 2.0
 **/

import { WireRouter } from '../../../wire/router.js'
import Promise from 'bluebird'
import _ from 'lodash'
import logger from '../../../util/logger.js'
import timeutil from '../../../util/timeutil.js'
import * as apiutil from '../../../util/apiutil.js'
import wireutil from '../../../wire/util.js'
import wire from '../../../wire/index.js'
import * as dbapi from '../../../db/api.js'
import * as db from '../../../db/index.js'
export default (function(push, pushdev, channelRouter) {
    const log = logger.createLogger('watcher-groups')
    function sendReleaseDeviceControl(serial, channel) {
        push.send([
            channel
            , wireutil.envelope(new wire.UngroupMessage(wireutil.toDeviceRequirements({
                serial: {
                    value: serial
                    , match: 'exact'
                }
            })))
        ])
    }
    function sendGroupChange(group, subscribers, isChangedDates, isChangedClass, isAddedUser, users, isAddedDevice, devices, action) {
        function dates2String(dates) {
            return dates.map(function(date) {
                return {
                    start: date.start.toJSON()
                    , stop: date.stop.toJSON()
                }
            })
        }
        pushdev.send([
            wireutil.global
            , wireutil.envelope(new wire.GroupChangeMessage(new wire.GroupField(group.id, group.name, group.class, group.privilege, group.owner, dates2String(group.dates), group.duration, group.repetitions, group.devices, group.users, group.state, group.isActive), action, subscribers, isChangedDates, isChangedClass, isAddedUser, users, isAddedDevice, devices, timeutil.now('nano')))
        ])
    }
    function sendGroupUsersChange(group, users, devices, isAdded, action) {
        const isDeletedLater = action === 'GroupDeletedLater'
        pushdev.send([
            wireutil.global
            , wireutil.envelope(new wire.GroupUserChangeMessage(users, isAdded, group.id, isDeletedLater, devices))
        ])
    }
    function doUpdateDeviceOriginGroup(group) {
        return dbapi.updateDeviceOriginGroup(group.ticket.serial, group).then(function() {
            push.send([
                wireutil.global
                , wireutil.envelope(new wire.DeviceOriginGroupMessage(group.ticket.signature))
            ])
        })
    }
    function doUpdateDevicesCurrentGroup(group, devices) {
        return Promise.map(devices, function(serial) {
            return dbapi.updateDeviceCurrentGroup(serial, group)
        })
    }
    function doUpdateDevicesCurrentGroupFromOrigin(devices) {
        return Promise.map(devices, function(serial) {
            return dbapi.updateDeviceCurrentGroupFromOrigin(serial)
        })
    }

    function doUpdateDevicesGroupName(group) {
        return Promise.map(group.devices, function(serial) {
            return dbapi.updateDeviceGroupName(serial, group)
        })
    }

    function doUpdateDevicesCurrentGroupDates(group) {
        if (apiutil.isOriginGroup(group.class)) {
            return Promise.map(group.devices, function(serial) {
                return dbapi.loadDeviceBySerial(serial).then(function(device) {
                    return device.group.id === group.id ?
                        doUpdateDevicesCurrentGroup(group, [serial]) :
                        false
                })
            })
        }
        else {
            return Promise.map(group.devices, function(serial) {
                return doUpdateDevicesCurrentGroup(group, [serial])
            })
        }
    }
    function treatGroupUsersChange(group, users, isActive, isAddedUser) {
        if (isActive) {
            return Promise.map(users, function(email) {
                return Promise.map(group.devices, function(serial) {
                    return dbapi.loadDeviceBySerial(serial).then(function(device) {
                        if (device && device.group.id === group.id) {
                            if (!isAddedUser && device.owner && device.owner.email === email) {
                                return new Promise(function(resolve) {
                                    let messageListener
                                    const responseTimer = setTimeout(function() {
                                        channelRouter.removeListener(wireutil.global, messageListener)
                                        resolve(serial)
                                    }, 5000)
                                    messageListener = new WireRouter()
                                        .on(wire.LeaveGroupMessage, function(channel, message) {
                                            if (message.serial === serial &&
                                            message.owner.email === email) {
                                                clearTimeout(responseTimer)
                                                channelRouter.removeListener(wireutil.global, messageListener)
                                                resolve(serial)
                                            }
                                        })
                                        .handler()
                                    channelRouter.on(wireutil.global, messageListener)
                                    sendReleaseDeviceControl(serial, device.channel)
                                })
                            }
                            return serial
                        }
                        return false
                    })
                })
                    .then(function(devices) {
                        sendGroupUsersChange(group, [email], _.without(devices, false), isAddedUser, 'GroupUser(s)Updated')
                    })
            })
        }
        else {
            return sendGroupUsersChange(group, users, [], isAddedUser, 'GroupUser(s)Updated')
        }
    }
    function treatGroupDevicesChange(oldGroup, group, devices, isAddedDevice) {
        if (isAddedDevice) {
            return doUpdateDevicesCurrentGroup(group, devices)
        }
        else {
            return doUpdateDevicesCurrentGroupFromOrigin(devices)
                .then(function() {
                    if (group === null) {
                        sendGroupUsersChange(oldGroup, oldGroup.users, [], false, 'GroupDeletedLater')
                    }
                })
        }
    }
    function treatGroupDeletion(group) {
        if (apiutil.isOriginGroup(group.class)) {
            return dbapi.getRootGroup().then(function(rootGroup) {
                return Promise.map(group.devices, function(serial) {
                    return dbapi.updateDeviceOriginGroup(serial, rootGroup)
                })
                    .then(function() {
                        return sendGroupUsersChange(group, group.users, [], false, 'GroupDeletedLater')
                    })
            })
        }
        else {
            return sendGroupUsersChange(group, group.users, [], false, 'GroupDeleted')
        }
    }
    let changeStream
    db.connect().then(client => {
        const groups = client.collection('groups')
        changeStream = groups.watch([
            {
                $project: {
                    'fullDocument.id': 1
                    , 'fullDocument.name': 1
                    , 'fullDocument.class': 1
                    , 'fullDocument.privilege': 1
                    , 'fullDocument.owner': 1
                    , 'fullDocument.dates': 1
                    , 'fullDocument.duration': 1
                    , 'fullDocument.repetitions': 1
                    , 'fullDocument.devices': 1
                    , 'fullDocument.users': 1
                    , 'fullDocument.state': 1
                    , 'fullDocument.isActive': 1
                    , 'fullDocument.ticket': 1
                    , 'fullDocumentBeforeChange.id': 1
                    , 'fullDocumentBeforeChange.name': 1
                    , 'fullDocumentBeforeChange.class': 1
                    , 'fullDocumentBeforeChange.privilege': 1
                    , 'fullDocumentBeforeChange.owner': 1
                    , 'fullDocumentBeforeChange.dates': 1
                    , 'fullDocumentBeforeChange.duration': 1
                    , 'fullDocumentBeforeChange.repetitions': 1
                    , 'fullDocumentBeforeChange.devices': 1
                    , 'fullDocumentBeforeChange.users': 1
                    , 'fullDocumentBeforeChange.state': 1
                    , 'fullDocumentBeforeChange.isActive': 1
                    , 'fullDocumentBeforeChange.ticket': 1
                    , operationType: 1
                }
            }
        ], {fullDocument: 'whenAvailable', fullDocumentBeforeChange: 'whenAvailable'})
        changeStream.on('change', next => {
            log.info('Groups watcher next: ' + JSON.stringify(next))
            try {
                let newDoc, oldDoc, users, devices, isBecomeActive, isBecomeUnactive, isActive, isAddedUser, isAddedDevice, isUpdatedDeviceOriginGroup, isChangedDates, isChangedName
                let operationType = next.operationType
                if (next.fullDocument) {
                    newDoc = next.fullDocument
                }
                else {
                    newDoc = null
                }
                if (next.fullDocumentBeforeChange) {
                    oldDoc = next.fullDocumentBeforeChange
                }
                else {
                    oldDoc = null
                }
                if (newDoc === null && oldDoc === null) {
                    log.info('New group doc and old group doc is NULL')
                    return false
                }
                if (operationType === 'insert') {
                    sendGroupChange(newDoc, newDoc.users, false, false, false, [], false, [], 'created')
                    return sendGroupUsersChange(newDoc, newDoc.users, newDoc.devices, true, 'GroupCreated')
                }
                else if (operationType === 'delete') {
                    sendGroupChange(oldDoc, oldDoc.users, false, false, false, [], false, [], 'deleted')
                    users = oldDoc.users
                    devices = oldDoc.devices
                    isChangedDates = false
                    isActive = oldDoc.isActive
                    isBecomeActive = isBecomeUnactive = false
                    isAddedUser = isAddedDevice = false
                    isUpdatedDeviceOriginGroup = false
                    isChangedName = false
                }
                else {
                    users = _.xor(newDoc.users, oldDoc.users)
                    devices = _.xor(newDoc.devices, oldDoc.devices)
                    isChangedDates =
                        oldDoc.dates.length !== newDoc.dates.length ||
                            oldDoc.dates[0].start.getTime() !==
                                newDoc.dates[0].start.getTime() ||
                            oldDoc.dates[0].stop.getTime() !==
                                newDoc.dates[0].stop.getTime()
                    isActive = newDoc.isActive
                    isBecomeActive = !oldDoc.isActive && newDoc.isActive
                    isBecomeUnactive = oldDoc.isActive && !newDoc.isActive
                    isAddedUser = newDoc.users.length > oldDoc.users.length
                    isAddedDevice = newDoc.devices.length > oldDoc.devices.length
                    isUpdatedDeviceOriginGroup =
                        newDoc.ticket !== null &&
                            (oldDoc.ticket === null ||
                                newDoc.ticket.signature !== oldDoc.ticket.signature)
                    isChangedName = oldDoc.name !== newDoc.name
                    if (!isUpdatedDeviceOriginGroup) {
                        sendGroupChange(newDoc, _.union(oldDoc.users, newDoc.users), isChangedDates, oldDoc.class !== newDoc.class, isAddedUser, users, isAddedDevice, devices, 'updated')
                    }
                }
                if (isUpdatedDeviceOriginGroup) {
                    return doUpdateDeviceOriginGroup(newDoc)
                }
                else if (isBecomeActive && newDoc.devices.length) {
                    return doUpdateDevicesCurrentGroup(newDoc, newDoc.devices)
                }
                else if (isBecomeUnactive && newDoc.devices.length) {
                    return doUpdateDevicesCurrentGroupFromOrigin(newDoc.devices)
                }
                else if (devices.length && isActive && !apiutil.isOriginGroup(oldDoc.class)) {
                    return treatGroupDevicesChange(oldDoc, newDoc, devices, isAddedDevice)
                }
                else if (newDoc === null) {
                    return treatGroupDeletion(oldDoc)
                }
                else if (isChangedDates && isActive) {
                    return doUpdateDevicesCurrentGroupDates(newDoc)
                }
                else if (users.length) {
                    return treatGroupUsersChange(oldDoc, users, isActive, isAddedUser)
                }
                else if (isChangedName) {
                    return doUpdateDevicesGroupName(newDoc)
                }
                return true
            }
            catch (e) {
                log.error(e)
            }
        })
    })
})
