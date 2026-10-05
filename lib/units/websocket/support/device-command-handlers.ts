import _ from 'lodash'
import type {Socket} from 'socket.io'
import type {MessageType} from '@protobuf-ts/runtime'
import {
    ShellCommandMessage,
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
    FileSystemGetMessage,
    FileSystemListMessage
} from '../../../wire/wire.js'

export interface DeviceCommandOptions {
    timeout?: number
    requireOwned?: boolean
}

export interface DeviceGroupRequest {
    timeout?: number
    requirements: Record<string, {value: string; match: 'semver' | 'glob' | 'exact'}>
}

/** Routing, ownership and persistence policies belong to the namespace adapter. */
export interface DeviceCommands {
    send<T extends object>(serial: string, type: MessageType<T>, message: T): Promise<void>
    run<T extends object>(serial: string, responseChannel: string, type: MessageType<T>, message: T, options?: DeviceCommandOptions): Promise<void>
    acquire(serial: string, responseChannel: string, request: DeviceGroupRequest): Promise<void>
    release(serial: string, responseChannel: string, request: DeviceGroupRequest): Promise<void>
}

export function registerDeviceCommands(socket: Socket, commands: DeviceCommands, jwt: string) {
    const {send: sendOwned, run: runTx} = commands
    const createKeyHandler = (type: MessageType<{key: string}>) => (serial: string, data: any) => {
        sendOwned(serial, type, {key: data.key}).catch(() => {})
    }
    // Touch / input events (fire-and-forget to the owned device).
    socket.on('input.touchDown', (serial: string, data: any) => {
        sendOwned(serial, TouchDownMessage, {
            seq: data.seq, contact: data.contact, x: data.x, y: data.y, pressure: data.pressure
        }).catch(() => {})
    })
    socket.on('input.touchMove', (serial: string, data: any) => {
        sendOwned(serial, TouchMoveMessage, {
            seq: data.seq, contact: data.contact, x: data.x, y: data.y, pressure: data.pressure
        }).catch(() => {})
    })
    socket.on('input.touchMoveIos', (serial: string, data: any) => {
        sendOwned(serial, TouchMoveIosMessage, {
            toX: data.toX, toY: data.toY, fromX: data.fromX, fromY: data.fromY, duration: data.duration || 0
        }).catch(() => {})
    })
    socket.on('tapDeviceTreeElement', (serial: string, data: any) => {
        sendOwned(serial, TapDeviceTreeElement, {label: data.label}).catch(() => {})
    })
    socket.on('input.touchUp', (serial: string, data: any) => {
        sendOwned(serial, TouchUpMessage, {seq: data.seq, contact: data.contact}).catch(() => {})
    })
    socket.on('input.touchCommit', (serial: string, data: any) => {
        sendOwned(serial, TouchCommitMessage, {seq: data.seq}).catch(() => {})
    })
    socket.on('input.touchReset', (serial: string, data: any) => {
        sendOwned(serial, TouchResetMessage, {seq: data.seq}).catch(() => {})
    })
    socket.on('input.gestureStart', (serial: string, data: any) => {
        sendOwned(serial, GestureStartMessage, {seq: data.seq}).catch(() => {})
    })
    socket.on('input.gestureStop', (serial: string, data: any) => {
        sendOwned(serial, GestureStopMessage, {seq: data.seq}).catch(() => {})
    })

    socket.on('input.keyDown', createKeyHandler(KeyDownMessage))
    socket.on('input.keyUp', createKeyHandler(KeyUpMessage))
    socket.on('input.keyPress', createKeyHandler(KeyPressMessage))

    socket.on('input.type', (serial: string, data: any) => {
        sendOwned(serial, TypeMessage, {text: data.text}).catch(() => {})
    })
    socket.on('display.rotate', (serial: string, data: any) => {
        sendOwned(serial, RotateMessage, {rotation: data.rotation}).catch(() => {})
    })
    socket.on('quality.change', (serial: string, data: any) => {
        sendOwned(serial, ChangeQualityMessage, {quality: data.quality}).catch(() => {})
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

    socket.on('group.invite', commands.acquire)
    socket.on('group.kick', commands.release)

    socket.on('getTreeElementsIos', (serial: string, rc: string) =>
        runTx(serial, rc, GetIosTreeElements, {}, {requireOwned: false}))

    socket.on('shell.command', (serial: string, rc: string, data: any) =>
        runTx(serial, rc, ShellCommandMessage, {command: data.command, timeout: data.timeout}))

    socket.on('shell.keepalive', (serial: string, data: any) => {
        sendOwned(serial, ShellKeepAliveMessage, {timeout: data.timeout}).catch(() => {})
    })

    socket.on('device.install', (serial: string, rc: string, data: any) =>
        runTx(serial, rc, InstallMessage, {
            href: data.href,
            launch: data.launch === true,
            isApi: false,
            manifest: JSON.stringify(data.manifest),
            installFlags: ['-r'],
            jwt
        }))
    socket.on('device.installIos', (serial: string, rc: string, data: any) =>
        runTx(serial, rc, InstallMessage, {
            href: data.href,
            launch: data.launch === true,
            isApi: false,
            manifest: JSON.stringify(data.manifest),
            installFlags: [],
            jwt
        }))
    socket.on('device.uninstall', (serial: string, rc: string, data: any) =>
        runTx(serial, rc, UninstallMessage, {packageName: data.packageName}))
    socket.on('device.uninstallIos', (serial: string, rc: string, data: any) =>
        runTx(serial, rc, UninstallIosMessage, {packageName: data.packageName}))
    socket.on('device.launchApp', (serial: string, rc: string, data: any) =>
        runTx(serial, rc, LaunchDeviceApp, {pkg: data.pkg}))

    socket.on('device.unlockDevice', (serial: string) => {
        sendOwned(serial, UnlockDeviceMessage, {}).catch(() => {})
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
        sendOwned(serial, DashboardOpenMessage, {}).catch(() => {})
    })

    socket.on('fs.retrieve', (serial: string, rc: string, data: any) =>
        runTx(serial, rc, FileSystemGetMessage, {file: data.file, jwt}, {requireOwned: false}))
    socket.on('fs.list', (serial: string, rc: string, data: any) =>
        runTx(serial, rc, FileSystemListMessage, {dir: data.dir}))
    socket.on('fs.listIos', (serial: string, rc: string, data: any) =>
        runTx(serial, rc, FileSystemListMessage, {dir: data.dir}))
    socket.on('fs.retrieveIos', (serial: string, rc: string, data: any) =>
        runTx(serial, rc, FileSystemGetMessage, {file: data.file, jwt}))

}
