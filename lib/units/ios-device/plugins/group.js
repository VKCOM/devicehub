import events from 'events'
import Promise from 'bluebird'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import * as grouputil from '../../../util/grouputil.js'
import lifecycle from '../../../util/lifecycle.js'
import dbapi from '../../../db/api.mjs'
import request from 'request-promise'
import iosutil from './util/iosutil.js'
import apiutil from '../../../util/apiutil.js'
import solo from './solo.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import sub from '../../base-device/support/sub.js'
import channels from '../../base-device/support/channels.js'
export default syrup.serial()
    .dependency(solo)
    .dependency(router)
    .dependency(push)
    .dependency(sub)
    .dependency(channels)
    .define((options, solo, router, push, sub, channels) => {
    const log = logger.createLogger('device:plugins:group')
    const baseUrl = iosutil.getUri(options.wdaHost, options.wdaPort)
    let currentGroup = null
    let plugin = new events.EventEmitter()
    plugin.get = Promise.method(() => {
        if (!currentGroup) {
            throw new grouputil.NoGroupError()
        }
        return currentGroup
    })
    plugin.join = (newGroup, timeout, usage) => {
        return plugin.get()
            .then(() => {
            if (currentGroup.group !== newGroup.group) {
                throw new grouputil.AlreadyGroupedError()
            }
            log.info('Update timeout for ', apiutil.QUARTER_MINUTES)
            channels.updateTimeout(currentGroup.group, apiutil.QUARTER_MINUTES)
            let newTimeout = channels.getTimeout(currentGroup.group)
            dbapi.enhanceStatusChangedAt(options.serial, newTimeout).then(() => {
                return currentGroup
            })
        })
            .catch(grouputil.NoGroupError, () => {
            currentGroup = newGroup
            log.important('Now owned by "%s"', currentGroup.email)
            log.important('Device now in group "%s"', currentGroup.name)
            log.info('Rent time is ' + timeout)
            log.info('Subscribing to group channel "%s"', currentGroup.group)
            channels.register(currentGroup.group, {
                timeout: timeout || options.groupTimeout
                , alias: solo.channel
            })
            dbapi.enhanceStatusChangedAt(options.serial, timeout)
            sub.subscribe(currentGroup.group)
            push.send([
                wireutil.global
                , wireutil.envelope(new wire.JoinGroupMessage(options.serial, currentGroup, usage))
            ])
            const handleRequest = (reqOptions) => {
                return new Promise((resolve, reject) => {
                    request(reqOptions)
                        .then((res) => {
                        resolve(res)
                    })
                        .catch((err) => {
                        reject(err)
                    })
                })
            }
            dbapi.loadDeviceBySerial(options.serial).then((device) => {
                // No device size/type = First device session
                if (!device.display.width || !device.display.height || !device.deviceType) {
                    // Get device type
                    let deviceType
                    handleRequest({
                        method: 'GET'
                        , uri: `${baseUrl}/wda/device/info`
                        , json: true
                    })
                        .then((deviceInfo) => {
                        let deviceInfoModel = deviceInfo.value.model.toLowerCase()
                        let deviceInfoName = deviceInfo.value.name.toLowerCase()
                        if (deviceInfoModel.includes('tv') || deviceInfoName.includes('tv')) {
                            deviceType = 'Apple TV'
                        }
                        else {
                            deviceType = 'iPhone'
                        }
                        // Store device type
                        log.info('Storing device type value: ' + deviceType)
                        push.send([
                            wireutil.global
                            , wireutil.envelope(new wire.DeviceTypeMessage(options.serial, deviceType))
                        ])
                    })
                        .catch((err) => {
                        log.error('Error storing device type')
                        return lifecycle.fatal(err)
                    })
                    // Get device size
                    handleRequest({
                        method: 'POST'
                        , uri: `${baseUrl}/session`
                        , body: {capabilities: {}}
                        , json: true,
                    })
                        .then((sessionResponse) => {
                        let sessionId = sessionResponse.sessionId
                        // Store device version
                        log.info('Storing device version')
                        push.send([
                            wireutil.global
                            , wireutil.envelope(new wire.SdkIosVersion(options.serial, sessionResponse.value.capabilities.device, sessionResponse.value.capabilities.sdkVersion))
                        ])
                        // Store battery info
                        if (deviceType !== 'Apple TV') {
                            handleRequest({
                                method: 'GET'
                                , uri: `${baseUrl}/session/${sessionId}/wda/batteryInfo`
                                , json: true,
                            })
                                .then((batteryInfoResponse) => {
                                let batteryState = iosutil.batteryState(batteryInfoResponse.value.state)
                                let batteryLevel = iosutil.batteryLevel(batteryInfoResponse.value.level)
                                push.send([
                                    wireutil.global
                                    , wireutil.envelope(new wire.BatteryIosEvent(options.serial, 'good', 'usb', batteryState, batteryLevel, 'n/a', 100))
                                ])
                            })
                                .catch((err) => log.error('Error storing battery', err))
                        }
                        // Store size info
                        return handleRequest({
                            method: 'GET'
                            , uri: `${baseUrl}/session/${sessionId}/window/size`
                            , json: true
                        }).then((firstSessionSize) => {
                            let deviceSize = firstSessionSize.value
                            let {width, height} = deviceSize
                            return handleRequest({
                                method: 'GET'
                                , uri: `${baseUrl}/session/${sessionId}/wda/screen`,
                            }).then((scaleResponse) => {
                                let parsedResponse = JSON.parse(scaleResponse)
                                let scale = parsedResponse.value.scale
                                height *= scale
                                width *= scale
                                log.info('Storing device size/scale')
                                push.send([
                                    wireutil.global
                                    , wireutil.envelope(new wire.SizeIosDevice(options.serial, height, width, scale))
                                ])
                            })
                        })
                    })
                        .catch((err) => {
                        log.error('Error storing device size/scale')
                        return lifecycle.fatal(err)
                    })
                }
            })
            plugin.emit('join', currentGroup)
            return currentGroup
        })
    }
    plugin.keepalive = () => {
        if (currentGroup) {
            channels.keepalive(currentGroup.group)
        }
    }
    plugin.leave = (reason) => {
        return plugin.get()
            .then(group => {
            log.important('No longer owned by "%s"', group.email)
            log.info('Unsubscribing from group channel "%s"', group.group)
            channels.unregister(group.group)
            sub.unsubscribe(group.group)
            push.send([
                wireutil.global
                , wireutil.envelope(new wire.LeaveGroupMessage(options.serial, group, reason))
            ])
            currentGroup = null
            plugin.emit('leave', group)
            return group
        })
    }
    router
        .on(wire.GroupMessage, (channel, message) => {
        let reply = wireutil.reply(options.serial)
        // grouputil.match(ident, message.requirements)
        Promise.method(() => {
            return plugin.join(message.owner, message.timeout, message.usage)
        })()
            .then(() => {
            push.send([
                channel
                , reply.okay()
            ])
        })
            .catch(grouputil.RequirementMismatchError, (err) => {
            push.send([
                channel
                , reply.fail(err.message)
            ])
        })
            .catch(grouputil.AlreadyGroupedError, (err) => {
            push.send([
                channel
                , reply.fail(err.message)
            ])
        })
    })
        .on(wire.AutoGroupMessage, (channel, message) => {
        return plugin.join(message.owner, message.timeout, message.identifier)
            .then(() => {
            plugin.emit('autojoin', message.identifier, true)
        })
            .catch(grouputil.AlreadyGroupedError, () => {
            plugin.emit('autojoin', message.identifier, false)
        })
    })
        .on(wire.UngroupMessage, (channel, message) => {
        let reply = wireutil.reply(options.serial)
        Promise.method(() => {
            return plugin.leave('ungroup_request')
        })()
            .then(() => {
            push.send([
                channel
                , reply.okay()
            ])
        })
            .catch(grouputil.NoGroupError, err => {
            push.send([
                channel
                , reply.fail(err.message)
            ])
        })
    })
    channels.on('timeout', channel => {
        if (currentGroup && channel === currentGroup.group) {
            plugin.leave('automatic_timeout')
        }
    })
    lifecycle.observe(() => {
        return plugin.leave('device_absent')
            .catch(grouputil.NoGroupError, () => true)
    })
    return plugin
})
