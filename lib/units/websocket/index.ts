/**
* Copyright 2019 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

import crypto from 'node:crypto'
import http from 'http'
import _ from 'lodash'
import {Adb} from '@u4/adbkit'
import logger from '../../util/logger.js'
import wireutil from '../../wire/util.js'
import {WireRouter} from '../../wire/router.js'
import datautil from '../../util/datautil.js'
import lifecycle from '../../util/lifecycle.js'
import cookieSession from './middleware/cookie-session.js'
import ip from './middleware/remote-ip.js'
import auth from './middleware/auth.js'
import * as apiutil from '../../util/apiutil.js'
import {Server} from 'socket.io'
import db from '../../db/index.js'
import EventEmitter from 'events'
import generateToken from '../api/helpers/generateToken.js'
import {
    UpdateAccessTokenMessage,
    DeleteUserMessage,
    DeviceChangeMessage,
    UserChangeMessage,
    GroupChangeMessage,
    DeviceGroupChangeMessage,
    GroupUserChangeMessage,
    DeviceLogMessage,
    DeviceIntroductionMessage,
    DeviceReadyMessage,
    DevicePresentMessage,
    DeviceAbsentMessage,
    InstalledApplications,
    JoinGroupMessage,
    JoinGroupByAdbFingerprintMessage,
    LeaveGroupMessage,
    DeviceStatusMessage,
    DeviceIdentityMessage,
    TransactionProgressMessage,
    TransactionDoneMessage,
    TransactionTreeMessage,
    DeviceLogcatEntryMessage,
    AirplaneModeEvent,
    BatteryEvent,
    GetServicesAvailabilityMessage,
    DeviceBrowserMessage,
    ConnectivityEvent,
    PhoneStateEvent,
    RotationEvent,
    CapabilitiesMessage,
    ReverseForwardsEvent,
    TemporarilyUnavailableMessage,
    UpdateRemoteConnectUrl,
    KeyDownMessage,
    KeyUpMessage,
    KeyPressMessage,
    TouchDownMessage,
    TouchMoveMessage,
    TouchMoveIosMessage,
    TouchUpMessage,
    TouchCommitMessage,
    TouchResetMessage,
    GestureStartMessage,
    GestureStopMessage,
    TypeMessage,
    TapDeviceTreeElement,
    RotateMessage,
    ChangeQualityMessage,
    AdbKeysUpdatedMessage,
    ShellCommandMessage,
    ShellKeepAliveMessage,
    UninstallIosMessage,
    UnlockDeviceMessage,
    DashboardOpenMessage,
    AirplaneSetMessage,
    PasteMessage,
    CopyMessage,
    PhysicalIdentifyMessage,
    RebootMessage,
    AccountCheckMessage,
    AccountRemoveMessage,
    AccountAddMenuMessage,
    AccountAddMessage,
    AccountGetMessage,
    SdStatusMessage,
    RingerSetMessage,
    RingerGetMessage,
    WifiSetEnabledMessage,
    WifiGetStatusMessage,
    BluetoothSetEnabledMessage,
    BluetoothGetStatusMessage,
    BluetoothCleanBondedMessage,
    GroupMessage,
    UngroupMessage,
    GetIosTreeElements,
    InstallMessage,
    UninstallMessage,
    LaunchDeviceApp,
    GetInstalledApplications,
    KillDeviceApp,
    TerminateDeviceApp,
    GetAppAssetsList,
    GetAppAsset,
    GetAppHTML,
    GetAppInspectServerUrl,
    ForwardTestMessage,
    ForwardCreateMessage,
    ForwardRemoveMessage,
    LogcatStartMessage,
    LogcatStopMessage,
    ConnectStartMessage,
    ConnectStopMessage,
    BrowserOpenMessage,
    BrowserClearMessage,
    StoreOpenMessage,
    ScreenCaptureMessage,
    FileSystemGetMessage,
    FileSystemListMessage
} from '../../wire/wire.js'
import AllModel from '../../db/models/all/index.js'
import UserModel from '../../db/models/user/index.js'
import type {MessageType} from '@protobuf-ts/runtime'

interface Options {
    port: number
    secret: string
    ssid: string
    storageUrl: string
    endpoints: {
        sub: string[]
        push: string[]
        subdev: string[]
        pushdev: string[]
    }
}

export default (async (options: Options) => {
    const log = logger.createLogger('websocket')
    const server = http.createServer()

    const io = new Server(server, {
        serveClient: false,
        transports: ['websocket'],
        pingTimeout: 60000,
        pingInterval: 30000
    })

    const channelRouter = new EventEmitter()
    const zmqSockets = await db.createZMQSockets({...options.endpoints}, log)
    const sub = zmqSockets.sub!
    const subdev = zmqSockets.subdev!
    const push = zmqSockets.push!
    const pushdev = zmqSockets.pushdev!
    await db.connect({push, pushdev, channelRouter})

    ;[wireutil.global].forEach((channel) => {
        log.info('Subscribing to permanent webosocket channel "%s"', channel)
        sub.subscribe(channel)
    })
    sub.on('message', (channel: any, data: any) => {
        channelRouter.emit(channel.toString(), channel, data)
    })

    io.use(cookieSession({
        name: options.ssid,
        keys: [options.secret]
    }))
    io.use(ip({
        trust: () => true
    }))
    io.use(auth({secret: options.secret}))

    io.on('connection', (socket) => {
        const req = socket.request as any
        const user = req.user
        const channels: string[] = []

        user.ip = socket.handshake.query.uip || req.ip
        socket.emit('socket.ip', user.ip)

        const joinChannel = (channel: string) => {
            channels.push(channel)
            log.info('Subscribing to permanent websocket joinChannel channel "%s"', channel)
            channelRouter.on(channel, messageListener)
            sub.subscribe(channel)
        }

        const leaveChannel = (channel: string) => {
            const idx = channels.indexOf(channel)
            if (idx !== -1) channels.splice(idx, 1)
            channelRouter.removeListener(channel, messageListener)
            sub.unsubscribe(channel)
        }

        const deviceIsOwned = (channel: string) => user?.ownedChannels?.has(channel)

        const serialToChannel = (serial: string) =>
            crypto.createHash('sha1').update(serial).digest('base64')

        const trySendPush = (args: any[]) => {
            if (deviceIsOwned(args[0])) {
                return push.send(args)
            }
        }

        const createKeyHandler = (Klass: MessageType<any>) =>
            (channel: string, data: any) => {
                try {
                    if (deviceIsOwned(channel)) {
                        push.send([channel, wireutil.pack(Klass, {
                            key: data.key
                        })])
                    }
                }
                catch {}
            }

        let disconnectSocket!: (value?: any) => void

        const messageListener = new WireRouter()
            .on(UpdateAccessTokenMessage, () => {
                socket.emit('user.keys.accessToken.updated')
            })
            .on(DeleteUserMessage, () => {
                disconnectSocket(true)
            })
            .on(DeviceChangeMessage, (channel: string, message: any) => {
                if (user.groups.subscribed.indexOf(message.device.group.id) > -1) {
                    socket.emit('device.change', {
                        important: true,
                        data: {
                            serial: message.device.serial,
                            group: message.device.group
                        }
                    })
                }
                if (user.groups.subscribed.indexOf(message.device.group.origin) > -1 ||
                    user.groups.subscribed.indexOf(message.oldOriginGroupId) > -1) {
                    socket.emit('user.settings.devices.' + message.action, message)
                }
            })
            .on(UserChangeMessage, (channel: string, message: any) => {
                message.targets.forEach((target: any) => {
                    socket.emit('user.' + target + '.users.' + message.action, message)
                })
            })
            .on(GroupChangeMessage, (channel: string, message: any) => {
                if (user.privilege === 'admin' ||
                    user.email === message.group.owner.email ||
                    !apiutil.isOriginGroup(message.group.class) &&
                        (message.isChangedDates || message.isChangedClass || message.devices.length)) {
                    socket.emit('user.settings.groups.' + message.action, message)
                }
                if (message.subscribers.indexOf(user.email) > -1) {
                    socket.emit('user.view.groups.' + message.action, message)
                }
            })
            .on(DeviceGroupChangeMessage, (channel: string, message: any) => {
                if (user.groups.subscribed.indexOf(message.id) > -1) {
                    if (user.groups.subscribed.indexOf(message.group.id) > -1) {
                        socket.emit('device.updateGroupDevice', {
                            important: true,
                            data: {
                                serial: message.serial,
                                group: message.group
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
            .on(GroupUserChangeMessage, (channel: string, message: any) => {
                if (message.users.indexOf(user.email) > -1) {
                    if (message.isAdded) {
                        user.groups.subscribed = [...new Set([...user.groups.subscribed, message.id])]
                        if (message.devices.length) {
                            socket.emit('device.addGroupDevices', {important: true, devices: message.devices})
                        }
                    }
                    else {
                        if (message.devices.length) {
                            socket.emit('device.removeGroupDevices', {important: true, devices: message.devices})
                        }
                        if (message.isDeletedLater) {
                            setTimeout(() => {
                                user.groups.subscribed = user.groups.subscribed.filter((v: string) => v !== message.id)
                            }, 5000)
                        }
                        else {
                            user.groups.subscribed = user.groups.subscribed.filter((v: string) => v !== message.id)
                        }
                    }
                }
            })
            .on(DeviceLogMessage, (channel: string, message: any) => {
                io.emit('logcat.log', message)
            })
            .on(DeviceIntroductionMessage, (channel: string, message: any) => {
                if (message && message.group && user.groups.subscribed.indexOf(message.group.id) > -1) {
                    io.emit('device.add', {
                        important: true,
                        data: {
                            serial: message.serial,
                            present: true,
                            provider: message.provider,
                            owner: null,
                            status: message.status,
                            ready: false,
                            reverseForwards: [],
                            group: message.group
                        }
                    })
                }
            })
            .on(DeviceReadyMessage, (channel: string, message: any) => {
                io.emit('device.change', {
                    important: true,
                    data: {
                        serial: message.serial,
                        channel: message.channel,
                        owner: null, // @todo Get rid of need to reset this here.
                        ready: true,
                        reverseForwards: [], // @todo Get rid of need to reset this here.
                    }
                })
            })
            .on(DevicePresentMessage, (channel: string, message: any) => {
                io.emit('device.change', {
                    important: true,
                    data: {
                        serial: message.serial,
                        present: true
                    }
                })
            })
            .on(DeviceAbsentMessage, (channel: string, message: any) => {
                user?.ownedChannels?.delete(serialToChannel(message.serial))

                io.emit('device.remove', {
                    important: true,
                    data: {
                        serial: message.serial,
                        present: false,
                        likelyLeaveReason: 'device_absent'
                    }
                })
            })
            .on(InstalledApplications, (channel: string, message: any) => {
                socket.emit('device.applications', {
                    important: true,
                    data: {
                        serial: message.serial,
                        applications: message.applications
                    }
                })
            })
            // @TODO refactor JoinGroupMessage route
            .on(JoinGroupMessage, (channel: string, message: any) => {
                if (!user?.ownedChannels) {
                    user.ownedChannels = new Set()
                }

                user.ownedChannels.add(serialToChannel(message.serial))

                AllModel.getInstalledApplications({serial: message.serial})
                    .then((applications: any) => {
                        socket.emit(`device.application-${message.serial}`, {
                            applications
                        })
                        socket.emit('device.change', {
                            important: true,
                            data: datautil.applyOwner({
                                serial: message.serial,
                                owner: message.owner,
                                likelyLeaveReason: 'owner_change',
                                usage: message.usage,
                                applications
                            }, user)
                        })
                    })
                    .catch(() => {
                        socket.emit('device.change', {
                            important: true,
                            data: datautil.applyOwner({
                                serial: message.serial,
                                owner: message.owner,
                                likelyLeaveReason: 'owner_change',
                                usage: message.usage
                            }, user)
                        })
                    })
            })
            .on(JoinGroupByAdbFingerprintMessage, (channel: string, message: any) => {
                socket.emit('user.keys.adb.confirm', {
                    title: message.comment,
                    fingerprint: message.fingerprint
                })
            })
            .on(LeaveGroupMessage, (channel: string, message: any) => {
                user?.ownedChannels?.delete(serialToChannel(message.serial))

                io.emit('device.change', {
                    important: true,
                    data: datautil.applyOwner({
                        serial: message.serial,
                        owner: null,
                        likelyLeaveReason: message.reason
                    }, user)
                })
            })
            .on(DeviceStatusMessage, (channel: string, message: any) => {
                message.likelyLeaveReason = 'status_change'
                io.emit('device.change', {
                    important: true,
                    data: message
                })
            })
            .on(DeviceIdentityMessage, (channel: string, message: any) => {
                datautil.applyData(message)
                io.emit('device.change', {
                    important: true,
                    data: message
                })
            })
            .on(TransactionProgressMessage, (channel: string, message: any) => {
                socket.emit('tx.progress', channel.toString(), message)
            })
            .on(TransactionDoneMessage, (channel: string, message: any) => {
                socket.emit('tx.done', channel.toString(), message)
            })
            .on(TransactionTreeMessage, (channel: string, message: any) => {
                socket.emit('tx.tree', channel.toString(), message)
            })
            .on(DeviceLogcatEntryMessage, (channel: string, message: any) => {
                socket.emit('logcat.entry', message)
            })
            .on(AirplaneModeEvent, (channel: string, message: any) => {
                io.emit('device.change', {
                    important: true,
                    data: {
                        serial: message.serial,
                        airplaneMode: message.enabled
                    }
                })
            })
            .on(BatteryEvent, (channel: string, message: any) => {
                const {serial} = message
                delete message.serial
                io.emit('device.change', {
                    important: false,
                    data: {
                        serial,
                        battery: message
                    }
                })
            })
            .on(GetServicesAvailabilityMessage, (channel: string, message: any) => {
                const serial = message.serial
                delete message.serial
                io.emit('device.change', {
                    important: true,
                    data: {
                        serial,
                        service: message
                    }
                })
            })
            .on(DeviceBrowserMessage, (channel: string, message: any) => {
                const {serial} = message
                delete message.serial
                io.emit('device.change', {
                    important: true,
                    data: datautil.applyBrowsers({
                        serial,
                        browser: message
                    })
                })
            })
            .on(ConnectivityEvent, (channel: string, message: any) => {
                const {serial} = message
                delete message.serial
                io.emit('device.change', {
                    important: false,
                    data: {
                        serial,
                        network: message
                    }
                })
            })
            .on(PhoneStateEvent, (channel: string, message: any) => {
                const {serial} = message
                delete message.serial
                io.emit('device.change', {
                    important: false,
                    data: {
                        serial,
                        network: message
                    }
                })
            })
            .on(RotationEvent, (channel: string, message: any) => {
                socket.emit('device.change', {
                    important: false,
                    data: {
                        serial: message.serial,
                        display: {
                            rotation: message.rotation
                        }
                    }
                })
            })
            .on(CapabilitiesMessage, (channel: string, message: any) => {
                socket.emit('device.change', {
                    important: false,
                    data: {
                        serial: message.serial,
                        capabilities: {
                            hasTouch: message.hasTouch,
                            hasCursor: message.hasCursor
                        }
                    }
                })
            })
            .on(ReverseForwardsEvent, (channel: string, message: any) => {
                socket.emit('device.change', {
                    important: false,
                    data: {
                        serial: message.serial,
                        reverseForwards: message.forwards
                    }
                })
            })
            .on(TemporarilyUnavailableMessage, (channel: string, message: any) => {
                socket.emit('temporarily-unavailable', {
                    data: {
                        removeConnectUrl: message.removeConnectUrl
                    }
                })
            })
            .on(UpdateRemoteConnectUrl, (channel: string, message: any) => {
                socket.emit('device.change', {
                    important: true,
                    data: {
                        serial: message.serial
                    }
                })
            })
            .handler()

        channelRouter.on(wireutil.global, messageListener)
        joinChannel(user.group)

        new Promise<void>((resolve) => {
            disconnectSocket = resolve
            socket.on('disconnect', () => resolve())

            socket.on('device.note', async (data: any) => {
                await AllModel.setDeviceNote(data.serial, data.note)
                const device = await AllModel.loadDevice(user.groups.subscribed, data.serial)
                if (device) {
                    io.emit('device.change', {
                        important: true,
                        data: {
                            serial: device.serial,
                            notes: device.notes
                        }
                    })
                }
            })

            socket.on('user.settings.update', (data: any) => {
                if (data.alertMessage === undefined) {
                    UserModel.updateUserSettings(user.email, data)
                }
                else {
                    UserModel.updateUserSettings(apiutil.STF_ADMIN_EMAIL, data)
                }
            })

            socket.on('user.settings.reset', () => {
                UserModel.resetUserSettings(user.email)
            })

            socket.on('user.keys.accessToken.generate', async (data: any) => {
                const {title} = data
                const token = generateToken(user, options.secret)
                await AllModel.saveUserAccessToken(user.email, {
                    title,
                    id: token.id,
                    jwt: token.jwt
                })
                socket.emit('user.keys.accessToken.generated', {
                    title,
                    token: token.jwt
                })
            })

            socket.on('user.keys.accessToken.remove', async (data: any) => {
                const isAdmin = user.privilege === apiutil.ADMIN
                const email = (isAdmin ? data.email : null) || user.email
                await AllModel.removeUserAccessToken(email, data.title)
                socket.emit('user.keys.accessToken.updated')
            })

            socket.on('user.keys.adb.add', async (data: any) => {
                try {
                    const key = await Adb.util.parsePublicKey(data.key)
                    const users = await UserModel.lookupUsersByAdbKey(key.fingerprint)
                    if (users.length) {
                        throw new AllModel.DuplicateSecondaryIndexError()
                    }
                    await UserModel.insertUserAdbKey(user.email, {
                        title: data.title,
                        fingerprint: key.fingerprint
                    })
                    socket.emit('user.keys.adb.added', {
                        title: data.title,
                        fingerprint: key.fingerprint
                    })
                    push.send([
                        wireutil.global,
                        wireutil.pack(AdbKeysUpdatedMessage, {})
                    ])
                }
                catch (err: any) {
                    socket.emit('user.keys.adb.error', {
                        message: err.message
                    })
                }
            })

            socket.on('user.keys.adb.accept', async (data: any) => {
                try {
                    const users = await UserModel.lookupUsersByAdbKey(data.fingerprint)
                    if (users.length) {
                        throw new AllModel.DuplicateSecondaryIndexError()
                    }
                    await UserModel.insertUserAdbKey(user.email, {
                        title: data.title,
                        fingerprint: data.fingerprint
                    })
                    socket.emit('user.keys.adb.added', {
                        title: data.title,
                        fingerprint: data.fingerprint
                    })
                    push.send([
                        user.group,
                        wireutil.pack(AdbKeysUpdatedMessage, {})
                    ])
                }
                catch (err: any) {
                    if (!(err instanceof AllModel.DuplicateSecondaryIndexError)) throw err
                }
            })

            socket.on('user.keys.adb.remove', async (data: any) => {
                await UserModel.deleteUserAdbKey(user.email, data.fingerprint)
                socket.emit('user.keys.adb.removed', data)
            })

            socket.on('shell.settings.execute', async (data: any) => {
                if (user.privilege !== apiutil.ADMIN) {
                    return
                }

                const {command} = data
                const devices = await AllModel.loadDevices()
                devices.forEach((device: any) => {
                    push.send([
                        device.channel,
                        wireutil.pack(ShellCommandMessage, {command, timeout: 10000})
                    ])
                })
            })

            // Touch events
            socket.on('input.touchDown', (channel: string, data: any) => {
                try {
                    trySendPush([
                        channel,
                        wireutil.pack(TouchDownMessage, {
                            seq: data.seq,
                            contact: data.contact,
                            x: data.x,
                            y: data.y,
                            pressure: data.pressure
                        })
                    ])
                }
                catch {}
            })

            socket.on('input.touchMove', (channel: string, data: any) => {
                try {
                    trySendPush([
                        channel,
                        wireutil.pack(TouchMoveMessage, {
                            seq: data.seq,
                            contact: data.contact,
                            x: data.x,
                            y: data.y,
                            pressure: data.pressure
                        })
                    ])
                }
                catch {}
            })

            socket.on('input.touchMoveIos', (channel: string, data: any) => {
                try {
                    trySendPush([
                        channel,
                        wireutil.pack(TouchMoveIosMessage, {
                            toX: data.toX,
                            toY: data.toY,
                            fromX: data.fromX,
                            fromY: data.fromY,
                            duration: data.duration || 0
                        })
                    ])
                }
                catch {}
            })

            socket.on('tapDeviceTreeElement', (channel: string, data: any) => {
                try {
                    trySendPush([
                        channel,
                        wireutil.pack(TapDeviceTreeElement, {
                            label: data.label
                        })
                    ])
                }
                catch {}
            })

            socket.on('input.touchUp', (channel: string, data: any) => {
                try {
                    trySendPush([
                        channel,
                        wireutil.pack(TouchUpMessage, {
                            seq: data.seq,
                            contact: data.contact
                        })
                    ])
                }
                catch {}
            })

            socket.on('input.touchCommit', (channel: string, data: any) => {
                try {
                    trySendPush([
                        channel,
                        wireutil.pack(TouchCommitMessage, {
                            seq: data.seq
                        })
                    ])
                }
                catch {}
            })

            socket.on('input.touchReset', (channel: string, data: any) => {
                try {
                    trySendPush([
                        channel,
                        wireutil.pack(TouchResetMessage, {
                            seq: data.seq
                        })
                    ])
                }
                catch {}
            })

            socket.on('input.gestureStart', (channel: string, data: any) => {
                try {
                    trySendPush([
                        channel,
                        wireutil.pack(GestureStartMessage, {
                            seq: data.seq
                        })
                    ])
                }
                catch {}
            })

            socket.on('input.gestureStop', (channel: string, data: any) => {
                try {
                    trySendPush([
                        channel,
                        wireutil.pack(GestureStopMessage, {
                            seq: data.seq
                        })
                    ])
                }
                catch {}
            })

            // Key events
            socket.on('input.keyDown', createKeyHandler(KeyDownMessage))
            socket.on('input.keyUp', createKeyHandler(KeyUpMessage))
            socket.on('input.keyPress', createKeyHandler(KeyPressMessage))

            socket.on('input.type', (channel: string, data: any) => {
                try {
                    trySendPush([
                        channel,
                        wireutil.pack(TypeMessage, {
                            text: data.text
                        })
                    ])
                }
                catch {}
            })

            socket.on('display.rotate', (channel: string, data: any) => {
                try {
                    trySendPush([
                        channel,
                        wireutil.pack(RotateMessage, {
                            rotation: data.rotation
                        })
                    ])
                }
                catch {}
            })

            socket.on('quality.change', (channel: string, data: any) => {
                try {
                    trySendPush([
                        channel,
                        wireutil.pack(ChangeQualityMessage, {
                            quality: data.quality
                        })
                    ])
                }
                catch {}
            })

            // Transactions
            socket.on('airplane.set', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, AirplaneSetMessage, {enabled: data.enabled})
                ])
            })

            socket.on('clipboard.paste', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, PasteMessage, {text: data.text})
                ])
            })

            socket.on('clipboard.copy', (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, CopyMessage, {})
                ])
            })

            socket.on('clipboard.copyIos', (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, CopyMessage, {})
                ])
            })

            socket.on('device.identify', (channel: string, responseChannel: string) => {
                trySendPush([
                    channel,
                    wireutil.tr(responseChannel, PhysicalIdentifyMessage, {})
                ])
            })

            socket.on('device.reboot', (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, RebootMessage, {})
                ])
            })

            socket.on('device.rebootIos', (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, RebootMessage, {})
                ])
            })

            socket.on('account.check', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, AccountCheckMessage, {type: data.type, account: data.account})
                ])
            })

            socket.on('account.remove', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, AccountRemoveMessage, {type: data.type, account: data.account})
                ])
            })

            socket.on('account.addmenu', (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, AccountAddMenuMessage, {})
                ])
            })

            socket.on('account.add', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, AccountAddMessage, {user: data.user, password: data.password})
                ])
            })

            socket.on('account.get', (channel: string, responseChannel: string, data: any) => {
                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, AccountGetMessage, {type: data.type})
                ])
            })

            socket.on('sd.status', (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, SdStatusMessage, {})
                ])
            })

            socket.on('ringer.set', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, RingerSetMessage, {mode: data.mode})
                ])
            })

            socket.on('ringer.get', (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, RingerGetMessage, {})
                ])
            })

            socket.on('wifi.set', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, WifiSetEnabledMessage, {enabled: data.enabled})
                ])
            })

            socket.on('wifi.get', (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, WifiGetStatusMessage, {})
                ])
            })

            socket.on('bluetooth.set', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, BluetoothSetEnabledMessage, {enabled: data.enabled})
                ])
            })

            socket.on('bluetooth.get', (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, BluetoothGetStatusMessage, {})
                ])
            })

            socket.on('bluetooth.cleanBonds', (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, BluetoothCleanBondedMessage, {})
                ])
            })

            socket.on('group.invite', async (channel: string, responseChannel: string, data: any) => {
                joinChannel(responseChannel)
                const keys = await UserModel.getUserAdbKeys(user.email)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, GroupMessage, {
                        owner: {email: user.email, name: user.name, group: user.group},
                        timeout: data.timeout || undefined,
                        requirements: wireutil.toDeviceRequirements(data.requirements),
                        keys: keys.map((key: any) => key.fingerprint)
                    })
                ])
            })

            socket.on('group.kick', (channel: string, responseChannel: string, data: any) => {
                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, UngroupMessage, {
                        requirements: wireutil.toDeviceRequirements(data.requirements)
                    })
                ])
            })

            socket.on('getTreeElementsIos', (channel: string, responseChannel: string) => {
                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, GetIosTreeElements, {})
                ])
            })

            socket.on('tx.cleanup', (channel: string) => {
                leaveChannel(channel)
            })

            socket.on('tx.punch', (channel: string) => {
                joinChannel(channel)
                socket.emit('tx.punch', channel)
            })

            socket.on('shell.command', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, ShellCommandMessage, {command: data.command, timeout: data.timeout})
                ])
            })

            socket.on('shell.keepalive', (channel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                push.send([
                    channel,
                    wireutil.pack(ShellKeepAliveMessage, {timeout: data.timeout})
                ])
            })

            socket.on('device.install', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                const installFlags = ['-r']
                const isApi = false
                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, InstallMessage, {
                        href: data.href,
                        launch: data.launch === true,
                        isApi,
                        manifest: JSON.stringify(data.manifest),
                        installFlags,
                        jwt: req.internalJwt
                    })
                ])
            })

            socket.on('device.installIos', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                const isApi = false
                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, InstallMessage, {
                        href: data.href,
                        launch: data.launch === true,
                        isApi,
                        manifest: JSON.stringify(data.manifest),
                        installFlags: [],
                        jwt: req.internalJwt
                    })
                ])
            })

            socket.on('device.uninstall', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, UninstallMessage, {packageName: data.packageName})
                ])
            })

            socket.on('device.uninstallIos', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.pack(UninstallIosMessage, {packageName: data.packageName})
                ])
            })

            socket.on('device.launchApp', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, LaunchDeviceApp, {pkg: data.pkg})
                ])
            })

            socket.on('device.getApps', _.debounce(async (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, GetInstalledApplications, {})
                ])
            }, 500))

            socket.on('app.kill', async (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    data?.force
                        ? wireutil.tr(responseChannel, KillDeviceApp, {})
                        : wireutil.tr(responseChannel, TerminateDeviceApp, {})
                ])
            })

            socket.on('app.getAssetList', async (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, GetAppAssetsList, {})
                ])
            })

            socket.on('app.getAsset', async (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, GetAppAsset, {url: data.url})
                ])
            })

            socket.on('app.getAppHTML', async (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, GetAppHTML, {})
                ])
            })

            socket.on('app.getInspectServerUrl', async (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, GetAppInspectServerUrl, {})
                ])
            })

            socket.on('device.unlockDevice', (channel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                push.send([
                    channel,
                    wireutil.pack(UnlockDeviceMessage, {})
                ])
            })

            socket.on('storage.upload', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                fetch(`${options.storageUrl}api/v1/resources?channel=${responseChannel}`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({url: data.url})
                })
                    .catch((err: any) => {
                        log.error('Storage upload had an error: %s', err.stack)
                        leaveChannel(responseChannel)
                        socket.emit('tx.cancel', responseChannel, {
                            success: false,
                            data: 'fail_upload'
                        })
                    })
            })

            socket.on('forward.test', (channel: string, responseChannel: string, data: any) => {
                joinChannel(responseChannel)
                if (!data.targetHost || data.targetHost === 'localhost') {
                    data.targetHost = user.ip
                }
                push.send([
                    channel,
                    wireutil.tr(responseChannel, ForwardTestMessage, {
                        targetHost: data.targetHost,
                        targetPort: data.targetPort
                    })
                ])
            })

            socket.on('forward.create', (channel: string, responseChannel: string, data: any) => {
                if (!data.targetHost || data.targetHost === 'localhost') {
                    data.targetHost = user.ip
                }
                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, ForwardCreateMessage, {
                        id: data.id,
                        devicePort: data.devicePort,
                        targetHost: data.targetHost,
                        targetPort: data.targetPort
                    })
                ])
            })

            socket.on('forward.remove', (channel: string, responseChannel: string, data: any) => {
                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, ForwardRemoveMessage, {id: data.id})
                ])
            })

            socket.on('logcat.start', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, LogcatStartMessage, {filters: data.filters})
                ])
            })

            socket.on('logcat.startIos', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, LogcatStartMessage, {filters: data.filters})
                ])
            })

            socket.on('logcat.stop', (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, LogcatStopMessage, {})
                ])
            })

            socket.on('logcat.stopIos', (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, LogcatStopMessage, {})
                ])
            })

            socket.on('connect.start', (channel: string, responseChannel: string) => {
                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, ConnectStartMessage, {})
                ])
            })

            socket.on('connect.startIos', (channel: string, responseChannel: string) => {
                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, ConnectStartMessage, {})
                ])
            })

            socket.on('connect.stop', (channel: string, responseChannel: string) => {
                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, ConnectStopMessage, {})
                ])
            })

            socket.on('browser.open', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, BrowserOpenMessage, {url: data.url, browser: data.browser})
                ])
            })

            socket.on('browser.openIos', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, BrowserOpenMessage, {url: data.url, browser: data.browser})
                ])
            })

            socket.on('browser.clear', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, BrowserClearMessage, {browser: data.browser})
                ])
            })

            socket.on('store.open', (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, StoreOpenMessage, {})
                ])
            })

            socket.on('store.openIos', (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, StoreOpenMessage, {})
                ])
            })

            socket.on('settings.open', (channel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                push.send([
                    channel,
                    wireutil.pack(DashboardOpenMessage, {})
                ])
            })

            socket.on('screen.capture', (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, ScreenCaptureMessage, {} as any)
                ])
            })

            socket.on('screen.captureIos', (channel: string, responseChannel: string) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, ScreenCaptureMessage, {} as any)
                ])
            })

            socket.on('fs.retrieve', (channel: string, responseChannel: string, data: any) => {
                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, FileSystemGetMessage, {file: data.file, jwt: req.internalJwt})
                ])
            })

            socket.on('fs.list', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, FileSystemListMessage, {dir: data.dir})
                ])
            })

            socket.on('fs.listIos', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, FileSystemListMessage, {dir: data.dir})
                ])
            })

            socket.on('fs.retrieveIos', (channel: string, responseChannel: string, data: any) => {
                if (!deviceIsOwned(channel)) {
                    return
                }

                joinChannel(responseChannel)
                push.send([
                    channel,
                    wireutil.tr(responseChannel, FileSystemGetMessage, {file: data.file, jwt: req.internalJwt})
                ])
            })

            socket.on('policy.accept', () => {
                UserModel.acceptPolicy(user.email)
            })
        })
            .finally(() => {
                channelRouter.removeListener(wireutil.global, messageListener)
                channels.forEach((channel) => {
                    channelRouter.removeListener(channel, messageListener)
                    sub.unsubscribe(channel)
                })
                socket.disconnect(true)
            })
            .catch((err: any) => {
                log.error('Client had an error, disconnecting due to probable loss of integrity: %s', err.stack)
            })
    })

    lifecycle.observe(() => {
        [push, pushdev, sub, subdev].forEach((sock) => {
            try {
                sock.close()
            }
            catch (err) {
                // No-op
            }
        })
    })

    server.listen(options.port)
    log.info('Listening on port websockets %s', options.port)
})
