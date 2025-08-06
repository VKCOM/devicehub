import {WireRouter} from '../../../wire/router.js'
import _ from 'lodash'
import util from 'util'
import {v4 as uuidv4} from 'uuid'
import logger from '../../../util/logger.js'
import timeutil from '../../../util/timeutil.js'
import wireutil from '../../../wire/util.js'
import wire from '../../../wire/index.js'
import dbapi from '../../../db/api.js'
import db from '../../../db/index.js'
export default (function(push, pushdev, channelRouter) {
    const log = logger.createLogger('watcher-devices')
    function sendReleaseDeviceControl(serial, channel) {
        push.send([
            channel,
            wireutil.envelope(new wire.UngroupMessage(wireutil.toDeviceRequirements({
                serial: {
                    value: serial,
                    match: 'exact'
                }
            })))
        ])
    }
    function sendDeviceGroupChange(id, group, serial, originName) {
        pushdev.send([
            wireutil.global,
            wireutil.envelope(new wire.DeviceGroupChangeMessage(id, new wire.DeviceGroupMessage(group.id, group.name, new wire.DeviceGroupOwnerMessage(group.owner.email, group.owner.name), new wire.DeviceGroupLifetimeMessage(group.dates[0].start?.getTime(), group.dates[0].stop?.getTime()), group.class, group.repetitions, originName), serial))
        ])
    }
    function sendDeviceChange(device1, device2, action) {
        function publishDevice() {
            const device = _.cloneDeep(device1)
            delete device.channel
            delete device.owner
            delete device.group.id
            delete device.group.lifeTime
            return device
        }
        pushdev.send([
            wireutil.global,
            wireutil.envelope(new wire.DeviceChangeMessage(publishDevice(), action, device2.group.origin, timeutil.now('nano')))
        ])
    }
    function sendReleaseDeviceControlAndDeviceGroupChange(device, sendDeviceGroupChangeWrapper) {
        let messageListener
        const responseTimer = setTimeout(function() {
            channelRouter.removeListener(wireutil.global, messageListener)
            sendDeviceGroupChangeWrapper()
        }, 5000)
        messageListener = new WireRouter()
            .on(wire.LeaveGroupMessage, function(channel, message) {
                if (message.serial === device.serial &&
                message.owner.email === device.owner.email) {
                    clearTimeout(responseTimer)
                    channelRouter.removeListener(wireutil.global, messageListener)
                    sendDeviceGroupChangeWrapper()
                }
            })
            .handler()
        channelRouter.on(wireutil.global, messageListener)
        sendReleaseDeviceControl(device.serial, device.channel)
    }
    let changeStream
    db.connect().then(client => {
        const devices = client.collection('devices')
        changeStream = devices.watch([
            {
                $project: {
                    'fullDocument.serial': 1,
                    'fullDocument.channel': 1,
                    'fullDocument.owner': 1,
                    'fullDocument.model': 1,
                    'fullDocument.operator': 1,
                    'fullDocument.manufacturer': 1,
                    'fullDocument.group.id': 1,
                    'fullDocument.group.name': 1,
                    'fullDocument.group.origin': 1,
                    'fullDocument.group.originName': 1,
                    'fullDocument.group.lifeTime': 1,
                    'fullDocument.group.owner': 1,
                    'fullDocument.provider.name': 1,
                    'fullDocument.network.type': 1,
                    'fullDocument.network.subtype': 1,
                    'fullDocument.display.height': 1,
                    'fullDocument.display.width': 1,
                    'fullDocument.version': 1,
                    'fullDocument.sdk': 1,
                    'fullDocument.abi': 1,
                    'fullDocument.cpuPlatform': 1,
                    'fullDocument.openGLESVersion': 1,
                    'fullDocument.phone.imei': 1,
                    'fullDocument.marketName': 1,
                    'fullDocumentBeforeChange.serial': 1,
                    'fullDocumentBeforeChange.channel': 1,
                    'fullDocumentBeforeChange.owner': 1,
                    'fullDocumentBeforeChange.model': 1,
                    'fullDocumentBeforeChange.operator': 1,
                    'fullDocumentBeforeChange.manufacturer': 1,
                    'fullDocumentBeforeChange.group.id': 1,
                    'fullDocumentBeforeChange.group.origin': 1,
                    'fullDocumentBeforeChange.group.originName': 1,
                    'fullDocumentBeforeChange.group.lifeTime': 1,
                    'fullDocumentBeforeChange.provider.name': 1,
                    'fullDocumentBeforeChange.network.type': 1,
                    'fullDocumentBeforeChange.network.subtype': 1,
                    'fullDocumentBeforeChange.display.height': 1,
                    'fullDocumentBeforeChange.display.width': 1,
                    'fullDocumentBeforeChange.version': 1,
                    'fullDocumentBeforeChange.sdk': 1,
                    'fullDocumentBeforeChange.abi': 1,
                    'fullDocumentBeforeChange.cpuPlatform': 1,
                    'fullDocumentBeforeChange.openGLESVersion': 1,
                    'fullDocumentBeforeChange.phone.imei': 1,
                    'fullDocumentBeforeChange.marketName': 1,
                    operationType: 1
                }
            }
        ], {fullDocument: 'whenAvailable', fullDocumentBeforeChange: 'whenAvailable'})
        changeStream.on('change', async(next) => {
            log.info('Devices watcher next: ' + JSON.stringify(next))
            try {
                let newDoc, oldDoc
                let operationType = next.operationType

                // @ts-ignore
                if (next.fullDocument) {
                    // @ts-ignore
                    newDoc = next.fullDocument
                }
                else {
                    newDoc = null
                }
                // @ts-ignore
                if (next.fullDocumentBeforeChange) {
                    // @ts-ignore
                    oldDoc = next.fullDocumentBeforeChange
                }
                else {
                    oldDoc = null
                }
                if (newDoc === null && oldDoc === null) {
                    log.info('New device doc and old device doc is NULL')
                    return false
                }
                if (operationType === 'insert') {
                    return sendDeviceChange(newDoc, newDoc, 'created')
                }
                else if (operationType === 'delete') {
                    sendDeviceChange(oldDoc, oldDoc, 'deleted')
                }
                else if (operationType === 'update') {
                    sendDeviceChange(newDoc, oldDoc, 'updated')
                }
                const isDeleted = newDoc === null
                const id = isDeleted ? oldDoc.group.id : newDoc.group.id
                const group = await dbapi.getGroup(id)

                function sendDeviceGroupChangeOnDeviceDeletion() {
                    const fakeGroup = Object.assign({}, group)
                    fakeGroup.id = util.format('%s', uuidv4()).replace(/-/g, '')
                    fakeGroup.name = 'none'
                    sendDeviceGroupChange(group?.id, fakeGroup, oldDoc.serial, oldDoc.group.originName)
                }

                function sendDeviceGroupChangeOnDeviceCurrentGroupUpdating() {
                    sendDeviceGroupChange(oldDoc.group.id, group, newDoc.serial, newDoc.group.originName)
                }
                if (group) {
                    if (isDeleted) {
                        if (oldDoc.owner) {
                            sendReleaseDeviceControlAndDeviceGroupChange(oldDoc, sendDeviceGroupChangeOnDeviceDeletion)
                            return
                        }
                        sendDeviceGroupChangeOnDeviceDeletion()
                        return
                    }
                    const isChangeCurrentGroup = newDoc.group.id !== oldDoc.group.id
                    const isChangeOriginGroup = newDoc.group.origin !== oldDoc.group.origin
                    const isChangeLifeTime = newDoc.group.lifeTime?.start?.getTime() !==
                        oldDoc.group.lifeTime?.start?.getTime()
                    if (isChangeLifeTime && !isChangeCurrentGroup && !isChangeOriginGroup) {
                        sendDeviceGroupChange(oldDoc.group.id, group, newDoc.serial, newDoc.group.originName)
                        return
                    }
                    if (isChangeCurrentGroup) {
                        if (newDoc.owner && group.users.indexOf(newDoc.owner.email) < 0) {
                            sendReleaseDeviceControlAndDeviceGroupChange(newDoc, sendDeviceGroupChangeOnDeviceCurrentGroupUpdating)
                        }
                        else {
                            sendDeviceGroupChangeOnDeviceCurrentGroupUpdating()
                        }
                    }
                    if (isChangeOriginGroup) {
                        const oldOriginGroup = await dbapi.getGroup(oldDoc.group.origin)
                        if (oldOriginGroup) {
                            await dbapi.removeOriginGroupDevice(oldOriginGroup, newDoc.serial)
                        }

                        const newOriginGroup = await dbapi.getGroup(newDoc.group.origin)
                        if (newOriginGroup) {
                            await dbapi.addOriginGroupDevice(newOriginGroup, newDoc.serial)
                        }
                        if (!isChangeCurrentGroup) {
                            sendDeviceGroupChange(newDoc.group.id, group, newDoc.serial, newDoc.group.originName)
                        }
                    }
                }
            }
            catch (e) {
                log.error(e)
            }
        })
    })
})
