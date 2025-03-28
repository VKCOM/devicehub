/**
* Copyright © 2019 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

import http from 'http'
import events from 'events'
import util from 'util'
import Promise from 'bluebird'
import _ from 'lodash'
import postmanRequest from 'postman-request'
import adbkit from '@irdk/adbkit'
import {v4 as uuidv4} from 'uuid'
import logger from '../../util/logger.js'
import wire from '../../wire/index.js'
import wireutil from '../../wire/util.js'
import {WireRouter} from '../../wire/router.js'
import * as dbapi from '../../db/api.js'
import datautil from '../../util/datautil.js'
import srv from '../../util/srv.js'
import lifecycle from '../../util/lifecycle.js'
import * as zmqutil from '../../util/zmqutil.js'
import cookieSession from './middleware/cookie-session.js'
import ip from './middleware/remote-ip.js'
import auth from './middleware/auth.js'
import * as jwtutil from '../../util/jwtutil.js'
import * as apiutil from '../../util/apiutil.js'
import {Server} from 'socket.io'
const request = Promise.promisifyAll(postmanRequest)
export default (function(options) {
    var log = logger.createLogger('websocket')
    var server = http.createServer()
    // eslint-disable-next-line camelcase
    const io_options = {
        serveClient: false
        , transports: ['websocket']
        , pingTimeout: 60000
        , pingInterval: 30000
    }
    const io = new Server(server, io_options)
    var channelRouter = new events.EventEmitter()
    // Output
    var push = zmqutil.socket('push')
    Promise.map(options.endpoints.push, function(endpoint) {
        return srv.resolve(endpoint).then(function(records) {
            return srv.attempt(records, function(record) {
                log.info('Sending output to "%s"', record.url)
                push.connect(record.url)
                return Promise.resolve(true)
            })
        })
    })
        .catch(function(err) {
            log.fatal('Unable to connect to push endpoint', err)
            lifecycle.fatal()
        })
    // Input
    var sub = zmqutil.socket('sub')
    Promise.map(options.endpoints.sub, function(endpoint) {
        return srv.resolve(endpoint).then(function(records) {
            return srv.attempt(records, function(record) {
                log.info('Receiving input from "%s"', record.url)
                sub.connect(record.url)
                return Promise.resolve(true)
            })
        })
    }).catch(function(err) {
        log.fatal('Unable to connect to sub endpoint', err)
        lifecycle.fatal()
    });
    [wireutil.global].forEach(function(channel) {
        log.info('Subscribing to permanent webosocket channel "%s"', channel)
        sub.subscribe(channel)
    })
    sub.on('message', function(channel, data) {
        channelRouter.emit(channel.toString(), channel, data)
    })
    io.use(cookieSession({
        name: options.ssid
        , keys: [options.secret]
    }))
    io.use(ip({
        trust: function() {
            return true
        }
    }))
    io.use(auth({secret: options.secret}))
    io.on('connection', function(socket) {
        var req = socket.request
        var {user} = req
        var channels = []
        user.ip = socket.handshake.query.uip || req.ip
        socket.emit('socket.ip', user.ip)
        function joinChannel(channel) {
            channels.push(channel)
            log.info('Subscribing to permanent webosocket joinChannel channel "%s"', channel)
            channelRouter.on(channel, messageListener)
            sub.subscribe(channel)
        }
        function leaveChannel(channel) {
            _.pull(channels, channel)
            channelRouter.removeListener(channel, messageListener)
            sub.unsubscribe(channel)
        }
        function createKeyHandler(Klass) {
            return function(channel, data) {
                push.send([channel, wireutil.envelope(new Klass(data.key))])
            }
        }
        let disconnectSocket
        var messageListener = new WireRouter()
            .on(wire.UpdateAccessTokenMessage, function() {
                socket.emit('user.keys.accessToken.updated')
            })
            .on(wire.DeleteUserMessage, function() {
                disconnectSocket(true)
            })
            .on(wire.DeviceChangeMessage, function(channel, message) {
                if (user.groups.subscribed.indexOf(message.device.group.id) > -1) {
                    socket.emit('device.change', {
                        important: true
                        , data: {
                            serial: message.device.serial
                            , group: message.device.group
                        }
                    })
                }
                if (user.groups.subscribed.indexOf(message.device.group.origin) > -1 ||
                user.groups.subscribed.indexOf(message.oldOriginGroupId) > -1) {
                    socket.emit('user.settings.devices.' + message.action, message)
                }
            })
            .on(wire.UserChangeMessage, function(channel, message) {
                Promise.map(message.targets, function(target) {
                    socket.emit('user.' + target + '.users.' + message.action, message)
                })
            })
            .on(wire.GroupChangeMessage, function(channel, message) {
                if (user.privilege === 'admin' ||
                user.email === message.group.owner.email ||
                !apiutil.isOriginGroup(message.group.class) &&
                    (message.action === 'deleted' ||
                        message.action === 'updated' &&
                            (message.isChangedDates || message.isChangedClass || message.devices.length))) {
                    socket.emit('user.settings.groups.' + message.action, message)
                }
                if (message.subscribers.indexOf(user.email) > -1) {
                    socket.emit('user.view.groups.' + message.action, message)
                }
            })
            .on(wire.DeviceGroupChangeMessage, function(channel, message) {
                if (user.groups.subscribed.indexOf(message.id) > -1) {
                    if (user.groups.subscribed.indexOf(message.group.id) > -1) {
                        socket.emit('device.updateGroupDevice', {
                            important: true
                            , data: {
                                serial: message.serial
                                , group: message.group
                            }
                        })
                    }
                    else {
                        socket.emit('device.removeGroupDevices', {important: true, devices: [message.serial]})
                    }
                }
                else if (user.groups.subscribed.indexOf(message.group.id) > -1) {
                    socket.emit('device.addGroupDevices', {important: true, devices: [message.serial]})
                }
            })
            .on(wire.GroupUserChangeMessage, function(channel, message) {
                if (message.users.indexOf(user.email) > -1) {
                    if (message.isAdded) {
                        user.groups.subscribed = _.union(user.groups.subscribed, [message.id])
                        if (message.devices.length) {
                            socket.emit('device.addGroupDevices', {important: true, devices: message.devices})
                        }
                    }
                    else {
                        if (message.devices.length) {
                            socket.emit('device.removeGroupDevices', {important: true, devices: message.devices})
                        }
                        if (message.isDeletedLater) {
                            setTimeout(function() {
                                user.groups.subscribed = _.without(user.groups.subscribed, message.id)
                            }, 5000)
                        }
                        else {
                            user.groups.subscribed = _.without(user.groups.subscribed, message.id)
                        }
                    }
                }
            })
            .on(wire.DeviceLogMessage, function(channel, message) {
                io.emit('logcat.log', message)
            })
            .on(wire.DeviceIntroductionMessage, function(channel, message) {
                if (message && message.group && user.groups.subscribed.indexOf(message.group.id) > -1) {
                    io.emit('device.add', {
                        important: true
                        , data: {
                            serial: message.serial
                            , present: true
                            , provider: message.provider
                            , owner: null
                            , status: message.status
                            , ready: false
                            , reverseForwards: []
                            , group: message.group
                        }
                    })
                }
            })
            .on(wire.DeviceReadyMessage, function(channel, message) {
                io.emit('device.change', {
                    important: true
                    , data: {
                        serial: message.serial
                        , channel: message.channel
                        , owner: null // @todo Get rid of need to reset this here.
                        , ready: true
                        , reverseForwards: [] // @todo Get rid of need to reset this here.
                    }
                })
            })
            .on(wire.DevicePresentMessage, function(channel, message) {
                io.emit('device.change', {
                    important: true
                    , data: {
                        serial: message.serial
                        , present: true
                    }
                })
            })
            .on(wire.DeviceAbsentMessage, function(channel, message) {
                io.emit('device.remove', {
                    important: true
                    , data: {
                        serial: message.serial
                        , present: false
                        , likelyLeaveReason: 'device_absent'
                    }
                })
            })
            .on(wire.InstalledApplications, function(channel, message, data) {
                socket.emit('device.applications', {
                    important: true
                    , data: {
                        serial: message.serial
                        , applications: message.applications
                    }
                })
            })
            // @TODO refactore JoimGroupMessage route
            .on(wire.JoinGroupMessage, function(channel, message) {
                dbapi.getInstalledApplications({serial: message.serial})
                    .then(applications => {
                        socket.emit(`device.application-${message.serial}`, {
                            applications: applications
                        })
                        socket.emit('device.change', {
                            important: true
                            , data: datautil.applyOwner({
                                serial: message.serial
                                , owner: message.owner
                                , likelyLeaveReason: 'owner_change'
                                , usage: message.usage
                                , applications: applications
                            }, user)
                        })
                    })
                    .catch(err => {
                        socket.emit('device.change', {
                            important: true
                            , data: datautil.applyOwner({
                                serial: message.serial
                                , owner: message.owner
                                , likelyLeaveReason: 'owner_change'
                                , usage: message.usage
                            }, user)
                        })
                    })
            })
            .on(wire.JoinGroupByAdbFingerprintMessage, function(channel, message) {
                socket.emit('user.keys.adb.confirm', {
                    title: message.comment
                    , fingerprint: message.fingerprint
                })
            })
            .on(wire.LeaveGroupMessage, function(channel, message) {
                io.emit('device.change', {
                    important: true
                    , data: datautil.applyOwner({
                        serial: message.serial
                        , owner: null
                        , likelyLeaveReason: message.reason
                    }, user)
                })
            })
            .on(wire.DeviceStatusMessage, function(channel, message) {
                message.likelyLeaveReason = 'status_change'
                io.emit('device.change', {
                    important: true
                    , data: message
                })
            })
            .on(wire.DeviceIdentityMessage, function(channel, message) {
                datautil.applyData(message)
                io.emit('device.change', {
                    important: true
                    , data: message
                })
            })
            .on(wire.TransactionProgressMessage, function(channel, message) {
                socket.emit('tx.progress', channel.toString(), message)
            })
            .on(wire.TransactionDoneMessage, function(channel, message) {
                socket.emit('tx.done', channel.toString(), message)
            })
            .on(wire.TransactionTreeMessage, function(channel, message) {
                socket.emit('tx.tree', channel.toString(), message)
            })
            .on(wire.DeviceLogcatEntryMessage, function(channel, message) {
                socket.emit('logcat.entry', message)
            })
            .on(wire.AirplaneModeEvent, function(channel, message) {
                io.emit('device.change', {
                    important: true
                    , data: {
                        serial: message.serial
                        , airplaneMode: message.enabled
                    }
                })
            })
            .on(wire.BatteryEvent, function(channel, message) {
                var {serial} = message
                delete message.serial
                io.emit('device.change', {
                    important: false
                    , data: {
                        serial: serial
                        , battery: message
                    }
                })
            })
            .on(wire.GetServicesAvailabilityMessage, function(channel, message) {
                let serial = message.serial
                delete message.serial
                io.emit('device.change', {
                    important: true
                    , data: {
                        serial: serial
                        , service: message
                    }
                })
            })
            .on(wire.DeviceBrowserMessage, function(channel, message) {
                var {serial} = message
                delete message.serial
                io.emit('device.change', {
                    important: true
                    , data: datautil.applyBrowsers({
                        serial: serial
                        , browser: message
                    })
                })
            })
            .on(wire.ConnectivityEvent, function(channel, message) {
                var {serial} = message
                delete message.serial
                io.emit('device.change', {
                    important: false
                    , data: {
                        serial: serial
                        , network: message
                    }
                })
            })
            .on(wire.PhoneStateEvent, function(channel, message) {
                var {serial} = message
                delete message.serial
                io.emit('device.change', {
                    important: false
                    , data: {
                        serial: serial
                        , network: message
                    }
                })
            })
            .on(wire.RotationEvent, function(channel, message) {
                socket.emit('device.change', {
                    important: false
                    , data: {
                        serial: message.serial
                        , display: {
                            rotation: message.rotation
                        }
                    }
                })
            })
            .on(wire.ReverseForwardsEvent, function(channel, message) {
                socket.emit('device.change', {
                    important: false
                    , data: {
                        serial: message.serial
                        , reverseForwards: message.forwards
                    }
                })
            })
            .on(wire.TemporarilyUnavailableMessage, function(channel, message) {
                socket.emit('temporarily-unavailable', {
                    data: {
                        removeConnectUrl: message.removeConnectUrl
                    }
                })
            })
            .on(wire.UpdateRemoteConnectUrl, function(channel, message) {
                socket.emit('device.change', {
                    important: true
                    , data: {
                        serial: message.serial
                    }
                })
            })
            .handler()
        channelRouter.on(wireutil.global, messageListener)
        // User's private group
        joinChannel(user.group)
        new Promise(function(resolve) {
            disconnectSocket = resolve
            socket.on('disconnect', resolve)
                // Global messages for all clients using socket.io
                //
                // Device note
                .on('device.note', function(data) {
                    return dbapi
                        .setDeviceNote(data.serial, data.note)
                        .then(function() {
                            return dbapi.loadDevice(user.groups.subscribed, data.serial)
                        })
                        .then(function(device) {
                            if (device) {
                                io.emit('device.change', {
                                    important: true
                                    , data: {
                                        serial: device.serial
                                        , notes: device.notes
                                    }
                                })
                            }
                        })
                })
                // Client specific messages
                //
                // Settings
                .on('user.settings.update', function(data) {
                    if (data.alertMessage === undefined) {
                        dbapi.updateUserSettings(user.email, data)
                    }
                    else {
                        dbapi.updateUserSettings(apiutil.STF_ADMIN_EMAIL, data)
                    }
                })
                .on('user.settings.reset', function() {
                    dbapi.resetUserSettings(user.email)
                })
                .on('user.keys.accessToken.generate', function(data) {
                    var jwt = jwtutil.encode({
                        payload: {
                            email: user.email
                            , name: user.name
                        }
                        , secret: options.secret
                    })
                    var tokenId = util
                        .format('%s-%s', uuidv4(), uuidv4())
                        .replace(/-/g, '')
                    var {title} = data
                    return dbapi
                        .saveUserAccessToken(user.email, {
                            title: title
                            , id: tokenId
                            , jwt: jwt
                        })
                        .then(function() {
                            socket.emit('user.keys.accessToken.generated', {
                                title: title
                                , tokenId: tokenId
                            })
                        })
                })
                .on('user.keys.accessToken.remove', function(data) {
                    return dbapi
                        .removeUserAccessToken(user.email, data.title)
                        .then(function() {
                            socket.emit('user.keys.accessToken.updated')
                        })
                })
                .on('user.keys.adb.add', function(data) {
                    return adbkit.Adb.util.parsePublicKey(data.key)
                        .then(function(key) {
                            return dbapi.lookupUsersByAdbKey(key.fingerprint)
                                .then(function(keys) {
                                    return keys
                                })
                                .then(function(users) {
                                    if (users.length) {
                                        throw new dbapi.DuplicateSecondaryIndexError()
                                    }
                                    else {
                                        return dbapi.insertUserAdbKey(user.email, {
                                            title: data.title
                                            , fingerprint: key.fingerprint
                                        })
                                    }
                                })
                                .then(function() {
                                    socket.emit('user.keys.adb.added', {
                                        title: data.title
                                        , fingerprint: key.fingerprint
                                    })
                                })
                        })
                        .then(function() {
                            push.send([
                                wireutil.global
                                , wireutil.envelope(new wire.AdbKeysUpdatedMessage())
                            ])
                        })
                        .catch(function(err) {
                            socket.emit('user.keys.adb.error', {
                                message: err.message
                            })
                        })
                })
                .on('user.keys.adb.accept', function(data) {
                    return dbapi.lookupUsersByAdbKey(data.fingerprint)
                        .then(function(keys) {
                            return keys
                        })
                        .then(function(users) {
                            if (users.length) {
                                throw new dbapi.DuplicateSecondaryIndexError()
                            }
                            else {
                                return dbapi.insertUserAdbKey(user.email, {
                                    title: data.title
                                    , fingerprint: data.fingerprint
                                })
                            }
                        })
                        .then(function() {
                            socket.emit('user.keys.adb.added', {
                                title: data.title
                                , fingerprint: data.fingerprint
                            })
                        })
                        .then(function() {
                            push.send([
                                user.group
                                , wireutil.envelope(new wire.AdbKeysUpdatedMessage())
                            ])
                        })
                        .catch(dbapi.DuplicateSecondaryIndexError, function() {
                            // No-op
                        })
                })
                .on('user.keys.adb.remove', function(data) {
                    return dbapi
                        .deleteUserAdbKey(user.email, data.fingerprint)
                        .then(function() {
                            socket.emit('user.keys.adb.removed', data)
                        })
                })
                .on('shell.settings.execute', function(data) {
                    let command = data.command
                    dbapi.loadDevices().then(devices => {
                        devices.forEach(device => {
                            push.send([
                                device.channel
                                , wireutil.envelope(new wire.ShellCommandMessage({
                                    command: command
                                    , timeout: 10000
                                }))
                            ])
                        })
                    })
                // TODO: поддержать обратный ответ
                // joinChannel(responseChannel)
                // push.send([
                //  channel
                //  , wireutil.transaction(
                //    responseChannel
                //    , new wire.ShellCommandMessage(data)
                //  )
                // ])
                })
                // Touch events
                .on('input.touchDown', function(channel, data) {
                    push.send([
                        channel
                        , wireutil.envelope(new wire.TouchDownMessage(data.seq, data.contact, data.x, data.y, data.pressure))
                    ])
                })
                .on('input.touchMove', function(channel, data) {
                    try {
                        push.send([
                            channel
                            , wireutil.envelope(new wire.TouchMoveMessage(data.seq, data.contact, data.x, data.y, data.pressure))
                        ])
                    }
                    catch (err) {
                    // workaround for https://github.com/openstf/stf/issues/1180
                        log.error('input.touchMove had an error', err.stack)
                    }
                })
                .on('input.touchMoveIos', function(channel, data) {
                    data.duration = 0.042
                    push.send([
                        channel
                        , wireutil.envelope(new wire.TouchMoveIosMessage(data.toX, data.toY, data.fromX, data.fromY, data.duration))
                    ])
                })
                .on('tapDeviceTreeElement', function(channel, data) {
                    push.send([
                        channel
                        , wireutil.envelope(new wire.TapDeviceTreeElement(data.label))
                    ])
                })
                .on('input.touchUp', function(channel, data) {
                    push.send([
                        channel
                        , wireutil.envelope(new wire.TouchUpMessage(data.seq, data.contact))
                    ])
                })
                .on('input.touchCommit', function(channel, data) {
                    push.send([
                        channel
                        , wireutil.envelope(new wire.TouchCommitMessage(data.seq))
                    ])
                })
                .on('input.touchReset', function(channel, data) {
                    push.send([
                        channel
                        , wireutil.envelope(new wire.TouchResetMessage(data.seq))
                    ])
                })
                .on('input.gestureStart', function(channel, data) {
                    push.send([
                        channel
                        , wireutil.envelope(new wire.GestureStartMessage(data.seq))
                    ])
                })
                .on('input.gestureStop', function(channel, data) {
                    push.send([
                        channel
                        , wireutil.envelope(new wire.GestureStopMessage(data.seq))
                    ])
                })
                // Key events
                .on('input.keyDown', createKeyHandler(wire.KeyDownMessage))
                .on('input.keyUp', createKeyHandler(wire.KeyUpMessage))
                .on('input.keyPress', createKeyHandler(wire.KeyPressMessage))
                .on('input.type', function(channel, data) {
                    push.send([
                        channel
                        , wireutil.envelope(new wire.TypeMessage(data.text))
                    ])
                })
                .on('display.rotate', function(channel, data) {
                    push.send([
                        channel
                        , wireutil.envelope(new wire.RotateMessage(data.rotation))
                    ])
                })
                .on('quality.change', function(channel, data) {
                    push.send([
                        channel
                        , wireutil.envelope(new wire.ChangeQualityMessage(data.quality))
                    ])
                })
                // Transactions
                .on('clipboard.paste', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.PasteMessage(data.text))
                    ])
                })
                .on('clipboard.copy', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.CopyMessage())
                    ])
                })
                .on('clipboard.copyIos', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.CopyMessage())
                    ])
                })
                .on('device.identify', function(channel, responseChannel) {
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.PhysicalIdentifyMessage())
                    ])
                })
                .on('device.reboot', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.RebootMessage())
                    ])
                })
                .on('device.rebootIos', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.RebootMessage())
                    ])
                })
                .on('account.check', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.AccountCheckMessage(data))
                    ])
                })
                .on('account.remove', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.AccountRemoveMessage(data))
                    ])
                })
                .on('account.addmenu', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.AccountAddMenuMessage())
                    ])
                })
                .on('account.add', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.AccountAddMessage(data.user, data.password))
                    ])
                })
                .on('account.get', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.AccountGetMessage(data))
                    ])
                })
                .on('sd.status', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.SdStatusMessage())
                    ])
                })
                .on('ringer.set', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.RingerSetMessage(data.mode))
                    ])
                })
                .on('ringer.get', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.RingerGetMessage())
                    ])
                })
                .on('wifi.set', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.WifiSetEnabledMessage(data.enabled))
                    ])
                })
                .on('wifi.get', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.WifiGetStatusMessage())
                    ])
                })
                .on('bluetooth.set', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.BluetoothSetEnabledMessage(data.enabled))
                    ])
                })
                .on('bluetooth.get', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.BluetoothGetStatusMessage())
                    ])
                })
                .on('bluetooth.cleanBonds', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.BluetoothCleanBondedMessage())
                    ])
                })
                .on('group.invite', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.GroupMessage(new wire.OwnerMessage(user.email, user.name, user.group), data.timeout || null, wireutil.toDeviceRequirements(data.requirements)))
                    ])
                })
                .on('group.kick', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.UngroupMessage(wireutil.toDeviceRequirements(data.requirements)))
                    ])
                })
                .on('getTreeElementsIos', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.GetIosTreeElements())
                    ])
                })
                .on('tx.cleanup', function(channel) {
                    leaveChannel(channel)
                })
                .on('tx.punch', function(channel) {
                    joinChannel(channel)
                    socket.emit('tx.punch', channel)
                })
                .on('shell.command', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.ShellCommandMessage(data))
                    ])
                })
                .on('shell.keepalive', function(channel, data) {
                    push.send([
                        channel
                        , wireutil.envelope(new wire.ShellKeepAliveMessage(data))
                    ])
                })
                .on('device.install', function(channel, responseChannel, data) {
                    const installFlags = ['-r']
                    const isApi = false
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.InstallMessage(data.href, data.launch === true, isApi, JSON.stringify(data.manifest), installFlags, req.internalJwt))
                    ])
                })
                .on('device.installIos', function(channel, responseChannel, data) {
                    const isApi = false
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.InstallMessage(data.href, data.launch === true, isApi, JSON.stringify(data.manifest), [], req.internalJwt))
                    ])
                })
                .on('device.uninstall', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.UninstallMessage(data))
                    ])
                })
                .on('device.uninstallIos', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.envelope(new wire.UninstallIosMessage(data.packageName))
                    ])
                })
                .on('storage.upload', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    request
                        .postAsync({
                            url: util.format('%sapi/v1/resources?channel=%s', options.storageUrl, responseChannel)
                            , json: true
                            , body: {
                                url: data.url
                            }
                        })
                        .catch(function(err) {
                            log.error('Storage upload had an error', err.stack)
                            leaveChannel(responseChannel)
                            socket.emit('tx.cancel', responseChannel, {
                                success: false
                                , data: 'fail_upload'
                            })
                        })
                })
                .on('forward.test', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    if (!data.targetHost || data.targetHost === 'localhost') {
                        data.targetHost = user.ip
                    }
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.ForwardTestMessage(data))
                    ])
                })
                .on('forward.create', function(channel, responseChannel, data) {
                    if (!data.targetHost || data.targetHost === 'localhost') {
                        data.targetHost = user.ip
                    }
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.ForwardCreateMessage(data))
                    ])
                })
                .on('forward.remove', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.ForwardRemoveMessage(data))
                    ])
                })
                .on('logcat.start', function(channel, responseChannel, data) {
                // #455 and #459
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.LogcatStartMessage(data))
                    ])
                })
                .on('logcat.startIos', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.LogcatStartMessage(data))
                    ])
                })
                .on('logcat.stop', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.LogcatStopMessage())
                    ])
                })
                .on('logcat.stopIos', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.LogcatStopMessage())
                    ])
                })
                .on('connect.start', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.ConnectStartMessage())
                    ])
                })
                .on('connect.startIos', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.ConnectStartMessage())
                    ])
                })
                .on('connect.stop', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.ConnectStopMessage())
                    ])
                })
                .on('browser.open', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.BrowserOpenMessage(data))
                    ])
                })
                .on('browser.openIos', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.BrowserOpenMessage(data))
                    ])
                })
                .on('browser.clear', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.BrowserClearMessage(data))
                    ])
                })
                .on('store.open', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.StoreOpenMessage())
                    ])
                })
                .on('store.openIos', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.StoreOpenMessage())
                    ])
                })
                .on('settings.open', function(channel, responseChannel) {
                    push.send([
                        channel
                        , wireutil.envelope(new wire.DashboardOpenMessage())
                    ])
                })
                .on('screen.capture', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.ScreenCaptureMessage())
                    ])
                })
                .on('screen.captureIos', function(channel, responseChannel) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.ScreenCaptureMessage())
                    ])
                })
                .on('fs.retrieve', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.FileSystemGetMessage(data.file, req.internalJwt))
                    ])
                })
                .on('fs.list', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.FileSystemListMessage(data))
                    ])
                })
                .on('fs.listIos', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.FileSystemListMessage(data))
                    ])
                })
                .on('fs.retrieveIos', function(channel, responseChannel, data) {
                    joinChannel(responseChannel)
                    push.send([
                        channel
                        , wireutil.transaction(responseChannel, new wire.FileSystemGetMessage(data.file, req.internalJwt))
                    ])
                })
                .on('policy.accept', function(data) {
                    dbapi.acceptPolicy(user.email)
                })
        })
            .finally(function() {
            // Clean up all listeners and subscriptions
                channelRouter.removeListener(wireutil.global, messageListener)
                channels.forEach(function(channel) {
                    channelRouter.removeListener(channel, messageListener)
                    sub.unsubscribe(channel)
                })
                socket.disconnect(true)
            })
            .catch(function(err) {
                log.error('Client had an error, disconnecting due to probable loss of integrity', err.stack)
            })
    })
    lifecycle.observe(function() {
        [push, sub].forEach(function(sock) {
            try {
                sock.close()
            }
            catch (err) {
                // No-op
            }
        })
    })
    server.listen(options.port)
    log.info('Listening on port websockets %d', options.port)
})
