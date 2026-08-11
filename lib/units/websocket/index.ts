/**
* Copyright 2019 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

import http from 'http'
import _ from 'lodash'
import {Adb} from '@u4/adbkit'
import logger from '../../util/logger.js'
import wireutil from '../../wire/util.js'
import {WireRouter} from '../../wire/router.js'
import datautil from '../../util/datautil.js'
import lifecycle from '../../util/lifecycle.js'
import srv from '../../util/srv.js'
import cookieSession from './middleware/cookieSession.js'
import ip from './middleware/remoteIp.js'
import auth from './middleware/auth.js'
import * as apiutil from '../../util/apiutil.js'
import {Server} from 'socket.io'
import db from '../../db/index.js'
import dbapi from '../../db/api.js'
import generateToken from '../api/helpers/generateToken.js'
import {DealerSocket} from '../../util/zmqsocket.js'
import {AppTransport} from '../../wire/app-transport.js'
import {TransactionManager} from '../../wire/transmanager.js'
import {ClientDispatcher} from './support/clientDispatcher.js'
import {DeviceOwnership} from './support/deviceOwnership.js'
import {OwnershipCache} from './support/ownershipCache.js'
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
    DeviceLogcatEntryMessage,
    ShellCommandMessage,
    AirplaneModeEvent,
    BatteryEvent,
    GetServicesAvailabilityMessage,
    DeviceBrowserMessage,
    ConnectivityEvent,
    PhoneStateEvent,
    RotationEvent,
    CapabilitiesMessage,

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

    LogcatStartMessage,
    LogcatStopMessage,
    ConnectStartMessage,
    ConnectStopMessage,
    BrowserOpenMessage,
    BrowserClearMessage,
    StoreOpenMessage,
    ScreenCaptureMessage,
    FileSystemGetMessage,
    FileSystemListMessage,
    SizeIosDevice
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
        proxy: string[]
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

    // One DEALER to the proxy. AppTransport wraps it; TransactionManager owns
    // request/reply correlation with optional progress streaming.
    const dealer = new DealerSocket({probeRouter: true})
    try {
        await Promise.all(options.endpoints.proxy.map((endpoint) =>
            srv.resolve(endpoint).then((records) =>
                srv.attempt(records, (record) => {
                    log.info('Sending to proxy "%s"', record.url)
                    dealer.connect(record.url)
                    return Promise.resolve(true)
                })
            )
        ))
    }
    catch (err: any) {
        log.fatal('Unable to connect to proxy endpoint: %s', (err && err.message) || err)
        return lifecycle.fatal()
    }

    const transport = new AppTransport(dealer)
    const txmanager = new TransactionManager(transport)
    await db.connect()

    // Short-lived cache: collapses burst of reconnects for the same user into
    // one DB query.  TTL 10 s is enough to cover a page-refresh burst while
    // staying fresh for normal group changes.
    const ownedCache = new OwnershipCache(10_000)

    // Resolve provider.name from Mongo for a given serial.
    const resolveProvider = async (serial: string): Promise<string | undefined> => {
        try {
            const device = await dbapi.loadDeviceBySerial(serial)
            return device?.provider?.name
        }
        catch (err: any) {
            log.warn('Could not resolve provider for %s: %s', serial, err?.message)
            return undefined
        }
    }

    // One WireRouter decodes each inbound broadcast once and dispatches the
    // One ClientDispatcher decodes each inbound broadcast once and dispatches the
    // decoded message to every connection's per-type handler.
    const hub = new ClientDispatcher()
    const route = new WireRouter()
        .on(UpdateAccessTokenMessage, (ch, m) => hub.dispatch('UpdateAccessTokenMessage', ch, m))
        .on(DeleteUserMessage, (ch, m) => hub.dispatch('DeleteUserMessage', ch, m))
        .on(DeviceChangeMessage, (ch, m) => hub.dispatch('DeviceChangeMessage', ch, m))
        .on(UserChangeMessage, (ch, m) => hub.dispatch('UserChangeMessage', ch, m))
        .on(GroupChangeMessage, (ch, m) => hub.dispatch('GroupChangeMessage', ch, m))
        .on(DeviceGroupChangeMessage, (ch, m) => hub.dispatch('DeviceGroupChangeMessage', ch, m))
        .on(GroupUserChangeMessage, (ch, m) => hub.dispatch('GroupUserChangeMessage', ch, m))
        .on(DeviceLogMessage, (ch, m) => hub.dispatch('DeviceLogMessage', ch, m))
        .on(DeviceIntroductionMessage, (ch, m) => hub.dispatch('DeviceIntroductionMessage', ch, m))
        .on(DeviceReadyMessage, (ch, m) => hub.dispatch('DeviceReadyMessage', ch, m))
        .on(DevicePresentMessage, (ch, m) => hub.dispatch('DevicePresentMessage', ch, m))
        .on(DeviceAbsentMessage, (ch, m) => hub.dispatch('DeviceAbsentMessage', ch, m))
        .on(InstalledApplications, (ch, m) => hub.dispatch('InstalledApplications', ch, m))
        .on(JoinGroupMessage, (ch, m) => hub.dispatch('JoinGroupMessage', ch, m))
        .on(JoinGroupByAdbFingerprintMessage, (ch, m) => hub.dispatch('JoinGroupByAdbFingerprintMessage', ch, m))
        .on(LeaveGroupMessage, (ch, m) => hub.dispatch('LeaveGroupMessage', ch, m))
        .on(DeviceStatusMessage, (ch, m) => hub.dispatch('DeviceStatusMessage', ch, m))
        .on(DeviceIdentityMessage, (ch, m) => hub.dispatch('DeviceIdentityMessage', ch, m))
        .on(SizeIosDevice, (ch, m) => hub.dispatch('SizeIosDevice', ch, m))
        .on(DeviceLogcatEntryMessage, (ch, m) => hub.dispatch('DeviceLogcatEntryMessage', ch, m))
        .on(AirplaneModeEvent, (ch, m) => hub.dispatch('AirplaneModeEvent', ch, m))
        .on(BatteryEvent, (ch, m) => hub.dispatch('BatteryEvent', ch, m))
        .on(GetServicesAvailabilityMessage, (ch, m) => hub.dispatch('GetServicesAvailabilityMessage', ch, m))
        .on(DeviceBrowserMessage, (ch, m) => hub.dispatch('DeviceBrowserMessage', ch, m))
        .on(ConnectivityEvent, (ch, m) => hub.dispatch('ConnectivityEvent', ch, m))
        .on(PhoneStateEvent, (ch, m) => hub.dispatch('PhoneStateEvent', ch, m))
        .on(RotationEvent, (ch, m) => hub.dispatch('RotationEvent', ch, m))
        .on(CapabilitiesMessage, (ch, m) => hub.dispatch('CapabilitiesMessage', ch, m))
        .on(TemporarilyUnavailableMessage, (ch, m) => hub.dispatch('TemporarilyUnavailableMessage', ch, m))
        .on(UpdateRemoteConnectUrl, (ch, m) => hub.dispatch('UpdateRemoteConnectUrl', ch, m))
        .handler()

    transport.on('broadcast', (body: Buffer) => route('', body))
    transport.registerBroadcast()

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
        const ownership = new DeviceOwnership()

        user.ip = socket.handshake.query.uip || req.ip
        socket.emit('socket.ip', user.ip)

        // Seed ownership from DB so that touch/commands work immediately after
        // a page refresh (ownership is otherwise empty until the next
        // JoinGroupMessage broadcast, which the device won't re-send if it's
        // already in the group).
        ownedCache.get(user.email, async () => {
            const devices = await dbapi.loadUserDevices(user.email)
            return devices
                .filter((d: any) => d.provider?.name)
                .map((d: any) => ({serial: d.serial, providerName: d.provider.name}))
        }).then((owned) => {
            for (const {serial, providerName} of owned) {
                ownership.claim(serial, providerName)
            }
        }).catch(() => {/* non-fatal: ownership stays empty, next JoinGroup will fix it */})

        // Resolves provider.name for a serial, checking the ownership cache first.
        const providerFor = async (serial: string): Promise<string | undefined> => {
            const cached = ownership.providerOf(serial)
            if (cached) {
                return cached
            }
            const providerName = await resolveProvider(serial)
            if (providerName) {
                ownership.rememberProvider(serial, providerName)
            }
            return providerName
        }

        // Fire-and-forget command to the owned device.
        const sendOwned = async (serial: string, envelope: Uint8Array) => {
            if (!ownership.isOwned(serial)) {
                return
            }
            const providerName = await providerFor(serial)
            if (!providerName) {
                return
            }
            transport.sendCommand(providerName, serial, envelope)
        }

        // Runs a device transaction and relays progress/result to the client's
        // response channel via tx.progress / tx.done events.
        const runTx = async <T extends object>(
            serial: string,
            responseChannel: string,
            messageType: MessageType<T>,
            message: T,
            {timeout, requireOwned = true}: {timeout?: number; requireOwned?: boolean} = {}
        ) => {
            if (requireOwned && !ownership.isOwned(serial)) {
                return
            }
            const providerName = await providerFor(serial)
            if (!providerName) {
                socket.emit('tx.done', responseChannel, {success: false, data: 'no_provider'})
                return
            }
            try {
                const result = await txmanager.runTransaction(providerName, serial, messageType, message, {
                    timeout,
                    onProgress: (data, progress, seq) =>
                        socket.emit('tx.progress', responseChannel, {source: serial, seq, data, progress})
                })
                socket.emit('tx.done', responseChannel, {
                    source: serial,
                    success: result.success,
                    data: result.data,
                    body: result.body && Object.keys(result.body).length ? JSON.stringify(result.body) : undefined
                })
            }
            catch (err: any) {
                socket.emit('tx.done', responseChannel, {
                    source: serial,
                    success: false,
                    data: (err && err.data) || 'fail'
                })
            }
        }

        const createKeyHandler = (Klass: MessageType<any>) =>
            (serial: string, data: any) => {
                sendOwned(serial, wireutil.pack(Klass, {key: data.key})).catch(() => {})
            }

        let disconnectSocket!: (value?: any) => void

        // Per-connection broadcast handler map registered into the hub.
        const handlers = {
            UpdateAccessTokenMessage: () => {
                socket.emit('user.keys.accessToken.updated')
            },
            // Only disconnect the socket of the user that was actually deleted.
            DeleteUserMessage: (_ch: string, message: any) => {
                if (message.email === user.email) {
                    disconnectSocket(true)
                }
            },
            DeviceChangeMessage: (_ch: string, message: any) => {
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
            },
            UserChangeMessage: (_ch: string, message: any) => {
                message.targets.forEach((target: any) => {
                    socket.emit('user.' + target + '.users.' + message.action, message)
                })
            },
            GroupChangeMessage: (_ch: string, message: any) => {
                if (user.privilege === 'admin' ||
                    user.email === message.group.owner.email ||
                    !apiutil.isOriginGroup(message.group.class) &&
                        (message.isChangedDates || message.isChangedClass || message.devices.length)) {
                    socket.emit('user.settings.groups.' + message.action, message)
                }
                if (message.subscribers.indexOf(user.email) > -1) {
                    socket.emit('user.view.groups.' + message.action, message)
                }
            },
            DeviceGroupChangeMessage: (_ch: string, message: any) => {
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
            },
            GroupUserChangeMessage: (_ch: string, message: any) => {
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
            },
            DeviceLogMessage: (_ch: string, message: any) => {
                io.emit('logcat.log', message)
            },
            DeviceIntroductionMessage: (_ch: string, message: any) => {
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
            },
            DeviceReadyMessage: (_ch: string, message: any) => {
                io.emit('device.change', {
                    important: true,
                    data: {
                        serial: message.serial,
                        channel: message.channel,
                        owner: null,
                        ready: true,
                        reverseForwards: [],
                    }
                })
            },
            DevicePresentMessage: (_ch: string, message: any) => {
                io.emit('device.change', {
                    important: true,
                    data: {
                        serial: message.serial,
                        present: true
                    }
                })
            },
            DeviceAbsentMessage: (_ch: string, message: any) => {
                ownership.release(message.serial)
                io.emit('device.remove', {
                    important: true,
                    data: {
                        serial: message.serial,
                        present: false,
                        likelyLeaveReason: 'device_absent'
                    }
                })
            },
            InstalledApplications: (_ch: string, message: any) => {
                socket.emit('device.applications', {
                    important: true,
                    data: {
                        serial: message.serial,
                        applications: message.applications
                    }
                })
            },
            DeviceLogcatEntryMessage: (_ch: string, message: any) => {
                socket.emit('logcat.entry', message)
            },
            JoinGroupMessage: (_ch: string, message: any) => {
                // Track ownership by serial (provider resolved lazily on first command).
                if (message.owner && message.owner.email === user.email) {
                    ownership.claim(message.serial, ownership.providerOf(message.serial) ?? '')
                    providerFor(message.serial).catch(() => {})
                }

                AllModel.getInstalledApplications({serial: message.serial})
                    .then((applications: any) => {
                        socket.emit(`device.application-${message.serial}`, {applications})
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
            },
            JoinGroupByAdbFingerprintMessage: (_ch: string, message: any) => {
                socket.emit('user.keys.adb.confirm', {
                    title: message.comment,
                    fingerprint: message.fingerprint
                })
            },
            LeaveGroupMessage: (_ch: string, message: any) => {
                ownership.release(message.serial)
                ownedCache.invalidate(user.email)
                io.emit('device.change', {
                    important: true,
                    data: datautil.applyOwner({
                        serial: message.serial,
                        owner: null,
                        likelyLeaveReason: message.reason
                    }, user)
                })
            },
            DeviceStatusMessage: (_ch: string, message: any) => {
                message.likelyLeaveReason = 'status_change'
                io.emit('device.change', {important: true, data: message})
            },
            DeviceIdentityMessage: (_ch: string, message: any) => {
                datautil.applyData(message)
                io.emit('device.change', {important: true, data: message})
            },
            SizeIosDevice: (_ch: string, message: any) => {
                io.emit('device.change', {
                    important: true,
                    data: {
                        serial: message.id,
                        display: {
                            width: message.width,
                            height: message.height,
                            scale: message.scale,
                            url: message.url
                        }
                    }
                })
            },
            AirplaneModeEvent: (_ch: string, message: any) => {
                io.emit('device.change', {
                    important: true,
                    data: {serial: message.serial, airplaneMode: message.enabled}
                })
            },
            BatteryEvent: (_ch: string, message: any) => {
                const {serial} = message
                delete message.serial
                io.emit('device.change', {important: false, data: {serial, battery: message}})
            },
            GetServicesAvailabilityMessage: (_ch: string, message: any) => {
                const serial = message.serial
                delete message.serial
                io.emit('device.change', {important: true, data: {serial, service: message}})
            },
            DeviceBrowserMessage: (_ch: string, message: any) => {
                const {serial} = message
                delete message.serial
                io.emit('device.change', {
                    important: true,
                    data: datautil.applyBrowsers({serial, browser: message})
                })
            },
            ConnectivityEvent: (_ch: string, message: any) => {
                const {serial} = message
                delete message.serial
                io.emit('device.change', {important: false, data: {serial, network: message}})
            },
            PhoneStateEvent: (_ch: string, message: any) => {
                const {serial} = message
                delete message.serial
                io.emit('device.change', {important: false, data: {serial, network: message}})
            },
            RotationEvent: (_ch: string, message: any) => {
                socket.emit('device.change', {
                    important: false,
                    data: {serial: message.serial, display: {rotation: message.rotation}}
                })
            },
            CapabilitiesMessage: (_ch: string, message: any) => {
                socket.emit('device.change', {
                    important: false,
                    data: {
                        serial: message.serial,
                        capabilities: {hasTouch: message.hasTouch, hasCursor: message.hasCursor}
                    }
                })
            },
            TemporarilyUnavailableMessage: (_ch: string, message: any) => {
                socket.emit('temporarily-unavailable', {
                    data: {removeConnectUrl: message.removeConnectUrl}
                })
            },
            UpdateRemoteConnectUrl: (_ch: string, message: any) => {
                socket.emit('device.change', {important: true, data: {serial: message.serial}})
            }
        }

        hub.add(socket.id, handlers)

        new Promise<void>((resolve) => {
            disconnectSocket = resolve
            socket.on('disconnect', () => resolve())

            socket.on('device.note', async (data: any) => {
                await AllModel.setDeviceNote(data.serial, data.note)
                const device = await AllModel.loadDevice(user.groups.subscribed, data.serial)
                if (device) {
                    io.emit('device.change', {
                        important: true,
                        data: {serial: device.serial, notes: device.notes}
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
                socket.emit('user.keys.accessToken.generated', {title, token: token.jwt})
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
                    socket.emit('user.keys.adb.added', {title: data.title, fingerprint: key.fingerprint})
                    transport.sendBroadcast(wireutil.pack(AdbKeysUpdatedMessage, {}))
                }
                catch (err: any) {
                    socket.emit('user.keys.adb.error', {message: err.message})
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
                    socket.emit('user.keys.adb.added', {title: data.title, fingerprint: data.fingerprint})
                    transport.sendBroadcast(wireutil.pack(AdbKeysUpdatedMessage, {}))
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
                    if (device.provider?.name) {
                        transport.sendCommand(device.provider.name, device.serial,
                            wireutil.pack(ShellCommandMessage, {command, timeout: 10000}))
                    }
                })
            })

            // Touch / input events (fire-and-forget to the owned device).
            socket.on('input.touchDown', (serial: string, data: any) => {
                sendOwned(serial, wireutil.pack(TouchDownMessage, {
                    seq: data.seq, contact: data.contact, x: data.x, y: data.y, pressure: data.pressure
                })).catch(() => {})
            })
            socket.on('input.touchMove', (serial: string, data: any) => {
                sendOwned(serial, wireutil.pack(TouchMoveMessage, {
                    seq: data.seq, contact: data.contact, x: data.x, y: data.y, pressure: data.pressure
                })).catch(() => {})
            })
            socket.on('input.touchMoveIos', (serial: string, data: any) => {
                sendOwned(serial, wireutil.pack(TouchMoveIosMessage, {
                    toX: data.toX, toY: data.toY, fromX: data.fromX, fromY: data.fromY, duration: data.duration || 0
                })).catch(() => {})
            })
            socket.on('tapDeviceTreeElement', (serial: string, data: any) => {
                sendOwned(serial, wireutil.pack(TapDeviceTreeElement, {label: data.label})).catch(() => {})
            })
            socket.on('input.touchUp', (serial: string, data: any) => {
                sendOwned(serial, wireutil.pack(TouchUpMessage, {seq: data.seq, contact: data.contact})).catch(() => {})
            })
            socket.on('input.touchCommit', (serial: string, data: any) => {
                sendOwned(serial, wireutil.pack(TouchCommitMessage, {seq: data.seq})).catch(() => {})
            })
            socket.on('input.touchReset', (serial: string, data: any) => {
                sendOwned(serial, wireutil.pack(TouchResetMessage, {seq: data.seq})).catch(() => {})
            })
            socket.on('input.gestureStart', (serial: string, data: any) => {
                sendOwned(serial, wireutil.pack(GestureStartMessage, {seq: data.seq})).catch(() => {})
            })
            socket.on('input.gestureStop', (serial: string, data: any) => {
                sendOwned(serial, wireutil.pack(GestureStopMessage, {seq: data.seq})).catch(() => {})
            })

            socket.on('input.keyDown', createKeyHandler(KeyDownMessage))
            socket.on('input.keyUp', createKeyHandler(KeyUpMessage))
            socket.on('input.keyPress', createKeyHandler(KeyPressMessage))

            socket.on('input.type', (serial: string, data: any) => {
                sendOwned(serial, wireutil.pack(TypeMessage, {text: data.text})).catch(() => {})
            })
            socket.on('display.rotate', (serial: string, data: any) => {
                sendOwned(serial, wireutil.pack(RotateMessage, {rotation: data.rotation})).catch(() => {})
            })
            socket.on('quality.change', (serial: string, data: any) => {
                sendOwned(serial, wireutil.pack(ChangeQualityMessage, {quality: data.quality})).catch(() => {})
            })

            // Transactions. Each takes (serial, responseChannel, [data]).
            socket.on('airplane.set', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, AirplaneSetMessage, {enabled: data.enabled}))
            socket.on('clipboard.paste', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, PasteMessage, {text: data.text}))
            socket.on('clipboard.copy', (serial: string, rc: string) =>
                runTx(serial, rc, CopyMessage, {}))
            socket.on('clipboard.copyIos', (serial: string, rc: string) =>
                runTx(serial, rc, CopyMessage, {}))
            socket.on('device.identify', (serial: string, rc: string) =>
                runTx(serial, rc, PhysicalIdentifyMessage, {}, {requireOwned: false}))
            socket.on('device.reboot', (serial: string, rc: string) =>
                runTx(serial, rc, RebootMessage, {}))
            socket.on('device.rebootIos', (serial: string, rc: string) =>
                runTx(serial, rc, RebootMessage, {}))
            socket.on('account.check', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, AccountCheckMessage, {type: data.type, account: data.account}))
            socket.on('account.remove', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, AccountRemoveMessage, {type: data.type, account: data.account}))
            socket.on('account.addmenu', (serial: string, rc: string) =>
                runTx(serial, rc, AccountAddMenuMessage, {}))
            socket.on('account.add', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, AccountAddMessage, {user: data.user, password: data.password}))
            socket.on('account.get', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, AccountGetMessage, {type: data.type}, {requireOwned: false}))
            socket.on('sd.status', (serial: string, rc: string) =>
                runTx(serial, rc, SdStatusMessage, {}))
            socket.on('ringer.set', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, RingerSetMessage, {mode: data.mode}))
            socket.on('ringer.get', (serial: string, rc: string) =>
                runTx(serial, rc, RingerGetMessage, {}))
            socket.on('wifi.set', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, WifiSetEnabledMessage, {enabled: data.enabled}))
            socket.on('wifi.get', (serial: string, rc: string) =>
                runTx(serial, rc, WifiGetStatusMessage, {}))
            socket.on('bluetooth.set', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, BluetoothSetEnabledMessage, {enabled: data.enabled}))
            socket.on('bluetooth.get', (serial: string, rc: string) =>
                runTx(serial, rc, BluetoothGetStatusMessage, {}))
            socket.on('bluetooth.cleanBonds', (serial: string, rc: string) =>
                runTx(serial, rc, BluetoothCleanBondedMessage, {}))

            socket.on('group.invite', async (serial: string, rc: string, data: any) => {
                const keys = await UserModel.getUserAdbKeys(user.email)
                runTx(serial, rc, GroupMessage, {
                    owner: {email: user.email, name: user.name, group: user.group},
                    timeout: data.timeout || undefined,
                    requirements: wireutil.toDeviceRequirements(data.requirements),
                    keys: keys.map((key: any) => key.fingerprint)
                }, {requireOwned: false})
            })
            socket.on('group.kick', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, UngroupMessage, {
                    requirements: wireutil.toDeviceRequirements(data.requirements)
                }, {requireOwned: false}))

            socket.on('getTreeElementsIos', (serial: string, rc: string) =>
                runTx(serial, rc, GetIosTreeElements, {}, {requireOwned: false}))

            socket.on('shell.command', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, ShellCommandMessage, {command: data.command, timeout: data.timeout}))

            socket.on('shell.keepalive', (serial: string, data: any) => {
                sendOwned(serial, wireutil.pack(ShellKeepAliveMessage, {timeout: data.timeout})).catch(() => {})
            })

            socket.on('device.install', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, InstallMessage, {
                    href: data.href,
                    launch: data.launch === true,
                    isApi: false,
                    manifest: JSON.stringify(data.manifest),
                    installFlags: ['-r'],
                    jwt: req.internalJwt
                }))
            socket.on('device.installIos', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, InstallMessage, {
                    href: data.href,
                    launch: data.launch === true,
                    isApi: false,
                    manifest: JSON.stringify(data.manifest),
                    installFlags: [],
                    jwt: req.internalJwt
                }))
            socket.on('device.uninstall', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, UninstallMessage, {packageName: data.packageName}))
            socket.on('device.uninstallIos', (serial: string, data: any) => {
                sendOwned(serial, wireutil.pack(UninstallIosMessage, {packageName: data.packageName})).catch(() => {})
            })
            socket.on('device.launchApp', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, LaunchDeviceApp, {pkg: data.pkg}))

            socket.on('device.unlockDevice', (serial: string) => {
                sendOwned(serial, wireutil.pack(UnlockDeviceMessage, {})).catch(() => {})
            })

            const getApps = (serial: string, rc: string) =>
                runTx(serial, rc, GetInstalledApplications, {})
            // Preserve the original debounce on the app list fetch.
            socket.on('device.getApps', _.debounce(getApps, 500))

            socket.on('app.kill', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, data?.force ? KillDeviceApp : TerminateDeviceApp, {}))
            socket.on('app.getAssetList', (serial: string, rc: string) =>
                runTx(serial, rc, GetAppAssetsList, {}))
            socket.on('app.getAsset', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, GetAppAsset, {url: data.url}))
            socket.on('app.getAppHTML', (serial: string, rc: string) =>
                runTx(serial, rc, GetAppHTML, {}))
            socket.on('app.getInspectServerUrl', (serial: string, rc: string) =>
                runTx(serial, rc, GetAppInspectServerUrl, {}))

            socket.on('storage.upload', async (serial: string, rc: string, data: any) => {
                if (!ownership.isOwned(serial)) {
                    return
                }
                try {
                    await fetch(`${options.storageUrl}api/v1/resources?channel=${rc}`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({url: data.url})
                    })
                }
                catch (err: any) {
                    log.error('Storage upload had an error: %s', err.stack)
                    socket.emit('tx.cancel', rc, {success: false, data: 'fail_upload'})
                }
            })

            socket.on('logcat.start', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, LogcatStartMessage, {filters: data.filters}))
            socket.on('logcat.startIos', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, LogcatStartMessage, {filters: data.filters}))
            socket.on('logcat.stop', (serial: string, rc: string) =>
                runTx(serial, rc, LogcatStopMessage, {}))
            socket.on('logcat.stopIos', (serial: string, rc: string) =>
                runTx(serial, rc, LogcatStopMessage, {}))

            socket.on('connect.start', (serial: string, rc: string) =>
                runTx(serial, rc, ConnectStartMessage, {}, {requireOwned: false}))
            socket.on('connect.startIos', (serial: string, rc: string) =>
                runTx(serial, rc, ConnectStartMessage, {}, {requireOwned: false}))
            socket.on('connect.stop', (serial: string, rc: string) =>
                runTx(serial, rc, ConnectStopMessage, {}, {requireOwned: false}))

            socket.on('browser.open', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, BrowserOpenMessage, {url: data.url, browser: data.browser}))
            socket.on('browser.openIos', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, BrowserOpenMessage, {url: data.url, browser: data.browser}))
            socket.on('browser.clear', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, BrowserClearMessage, {browser: data.browser}))

            socket.on('store.open', (serial: string, rc: string) =>
                runTx(serial, rc, StoreOpenMessage, {}))
            socket.on('store.openIos', (serial: string, rc: string) =>
                runTx(serial, rc, StoreOpenMessage, {}))

            socket.on('settings.open', (serial: string) => {
                sendOwned(serial, wireutil.pack(DashboardOpenMessage, {})).catch(() => {})
            })

            socket.on('screen.capture', (serial: string, rc: string) =>
                runTx(serial, rc, ScreenCaptureMessage, {} as any))
            socket.on('screen.captureIos', (serial: string, rc: string) =>
                runTx(serial, rc, ScreenCaptureMessage, {} as any))

            socket.on('fs.retrieve', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, FileSystemGetMessage, {file: data.file, jwt: req.internalJwt}, {requireOwned: false}))
            socket.on('fs.list', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, FileSystemListMessage, {dir: data.dir}))
            socket.on('fs.listIos', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, FileSystemListMessage, {dir: data.dir}))
            socket.on('fs.retrieveIos', (serial: string, rc: string, data: any) =>
                runTx(serial, rc, FileSystemGetMessage, {file: data.file, jwt: req.internalJwt}))

            socket.on('policy.accept', () => {
                UserModel.acceptPolicy(user.email)
            })
        })
            .finally(() => {
                hub.remove(socket.id)
                socket.disconnect(true)
            })
            .catch((err: any) => {
                log.error('Client had an error, disconnecting due to probable loss of integrity: %s', err.stack)
            })
    })

    lifecycle.observe(() => {
        try {
            transport.close()
        }
        catch {
            // No-op
        }
    })

    server.listen(options.port)
    log.info('Listening on port websockets %s', options.port)
})
