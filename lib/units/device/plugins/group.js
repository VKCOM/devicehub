import events from 'events'
import Promise from 'bluebird'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import * as grouputil from '../../../util/grouputil.js'
import lifecycle from '../../../util/lifecycle.js'
import * as dbapi from '../../../db/api.js'
import * as apiutil from '../../../util/apiutil.js'
import solo from './solo.js'
import identity from './util/identity.js'
import service from './service.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import sub from '../../base-device/support/sub.js'
import channels from '../../base-device/support/channels.js'
export default syrup.serial()
    .dependency(solo)
    .dependency(identity)
    .dependency(service)
    .dependency(router)
    .dependency(push)
    .dependency(sub)
    .dependency(channels)
    .define(function(options, solo, ident, service, router, push, sub, channels) {
        var log = logger.createLogger('device:plugins:group')
        var currentGroup = null
        var plugin = new events.EventEmitter()
        plugin.get = Promise.method(function() {
            if (!currentGroup) {
                throw new grouputil.NoGroupError()
            }
            return currentGroup
        })
        plugin.join = function(newGroup, timeout, usage) {
            return plugin.get()
                .then(function() {
                    if (currentGroup.group !== newGroup.group) {
                        log.error(`Cannot join group ${JSON.stringify(newGroup)} since this device is in group ${JSON.stringify(currentGroup)}`)
                        throw new grouputil.AlreadyGroupedError()
                    }
                    log.info('Update timeout for ', apiutil.QUARTER_MINUTES)
                    channels.updateTimeout(currentGroup.group, apiutil.QUARTER_MINUTES)
                    let newTimeout = channels.getTimeout(currentGroup.group)
                    dbapi.enhanceStatusChangedAt(options.serial, newTimeout).then(() => {
                        return currentGroup
                    })
                })
                .catch(grouputil.NoGroupError, function() {
                    currentGroup = newGroup
                    log.important('Now owned by "%s"', currentGroup.email)
                    log.important('Device now in group "%s"', currentGroup.name)
                    log.info('Rent time is ' + timeout)
                    log.info('Subscribing to group channel "%s"', currentGroup.group)
                    channels.register(currentGroup.group, {
                        timeout: timeout || options.groupTimeout
                        , alias: solo.channel
                    })
                    dbapi.enhanceStatusChangedAt(options.serial, timeout).then(() => {
                        sub.subscribe(currentGroup.group)
                        plugin.emit('join', currentGroup)
                        push.send([
                            wireutil.global
                            , wireutil.envelope(new wire.JoinGroupMessage(options.serial, currentGroup, usage))
                        ])
                        service.freezeRotation(0)
                        return currentGroup
                    })
                })
        }
        plugin.keepalive = function() {
            if (currentGroup) {
                channels.keepalive(currentGroup.group)
            }
        }
        plugin.leave = function(reason) {
            return plugin.get()
                .then(function(group) {
                    log.important('No longer owned by "%s"', group.email)
                    log.info('Unsubscribing from group channel "%s"', group.group)
                    dbapi.enhanceStatusChangedAt(options.serial, 0).then(() => {
                        push.send([
                            wireutil.global
                            , wireutil.envelope(new wire.LeaveGroupMessage(options.serial, group, reason))
                        ])
                        channels.unregister(group.group)
                        sub.unsubscribe(group.group)
                        currentGroup = null
                        plugin.emit('leave', group)
                        return group
                    })
                })
        }
        plugin.on('join', function() {
            service.wake()
            service.acquireWakeLock()
        })
        plugin.on('leave', function() {
            if (options.screenReset) {
                service.pressKey('home')
                service.thawRotation()
                dbapi.loadDeviceBySerial(options.serial).then(device => {
                    if (device.group.id === device.origin) {
                        log.warn('Cleaning device')
                        service.sendCommand('settings put system screen_brightness_mode 0')
                        service.sendCommand('settings put system screen_brightness 0')
                        service.setMasterMute(true)
                        service.sendCommand('input keyevent 26')
                        service.sendCommand('settings put global http_proxy :0')
                        service.sendCommand('pm clear com.android.chrome')
                        service.sendCommand('pm clear com.chrome.beta')
                        service.sendCommand('pm clear com.sec.android.app.sbrowser')
                        service.sendCommand('pm uninstall com.vkontakte.android')
                        service.sendCommand('pm uninstall com.vk.im')
                        service.sendCommand('pm uninstall com.vk.clips')
                        service.sendCommand('pm uninstall com.vk.calls')
                        service.sendCommand('pm uninstall com.vk.admin')
                        service.sendCommand('pm clear com.mi.globalbrowser')
                        service.sendCommand('pm clear com.microsoft.emmx')
                        service.sendCommand('pm clear com.huawei.browser')
                        service.sendCommand('pm uninstall --user 0 com.samsung.clipboardsaveservice')
                        service.sendCommand('pm uninstall --user 0 com.samsung.android.clipboarduiservice')
                        service.sendCommand('rm -rf /sdcard/Downloads')
                        service.sendCommand('rm -rf /storage/emulated/legacy/Downloads')
                        service.sendCommand('settings put global always_finish_activities 0')
                        service.sendCommand('pm enable-user com.google.android.gms')
                        service.sendCommand('settings put system font_scale 1.0')
                        service.sendCommand('su')
                        service.sendCommand('echo "chrome --disable-fre --no-default-browser-check —no-first-run" > /data/local/tmp/chrome-command-line')
                        service.sendCommand('am set-debug-app --persistent com.android.chrome')
                    }
                    else {
                        log.warn('Device was not cleared because it in custom group')
                    }
                })
            }
            service.releaseWakeLock()
        })
        router
            .on(wire.GroupMessage, function(channel, message) {
                let reply = wireutil.reply(options.serial)
                grouputil.match(ident, message.requirements)
                    .then(function() {
                        return plugin.join(message.owner, message.timeout, message.usage)
                    })
                    .then(function() {
                        push.send([
                            channel
                            , reply.okay()
                        ])
                    })
                    .catch(grouputil.RequirementMismatchError, function(err) {
                        push.send([
                            channel
                            , reply.fail(err.message)
                        ])
                    })
                    .catch(grouputil.AlreadyGroupedError, function(err) {
                        push.send([
                            channel
                            , reply.fail(err.message)
                        ])
                    })
            })
            .on(wire.AutoGroupMessage, function(channel, message) {
                return plugin.join(message.owner, message.timeout, message.identifier)
                    .then(function() {
                        plugin.emit('autojoin', message.identifier, true)
                    })
                    .catch(grouputil.AlreadyGroupedError, function() {
                        plugin.emit('autojoin', message.identifier, false)
                    })
            })
            .on(wire.UngroupMessage, function(channel, message) {
                let reply = wireutil.reply(options.serial)
                grouputil.match(ident, message.requirements)
                    .then(function() {
                        return plugin.leave('ungroup_request')
                    })
                    .then(function() {
                        push.send([
                            channel
                            , reply.okay()
                        ])
                    })
                    .catch(grouputil.NoGroupError, function(err) {
                        push.send([
                            channel
                            , reply.fail(err.message)
                        ])
                    })
            })
        channels.on('timeout', function(channel) {
            if (currentGroup && channel === currentGroup.group) {
                plugin.leave('automatic_timeout')
            }
        })
        lifecycle.observe(function() {
            return plugin.leave('device_absent')
                .catch(grouputil.NoGroupError, function() {
                    return true
                })
        })
        return plugin
    })
