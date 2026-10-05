import logger from '../../../util/logger.js'
import {deviceSerial, type ADBObserver} from '../ADBObserver.js'
import type {ConnectRequest} from './request.js'
import {WebhookHub} from './webhooks.js'

const log = logger.createLogger('provider:remote-devices')

/* Per-device overrides for the forked device worker */
export interface DeviceForkOverrides {
    silent: boolean
    silentAllowedEmail: string[]
    groupTimeout?: number
    /* Literal, never a template: it comes from an unauthenticated request */
    connectUrl?: string
    groupId?: string
    hideHeader: boolean
}

export interface RemoteDevice extends ConnectRequest {
    serial: string
    /*
     * 'connecting' until adb reports the device usable. 'releasing' while it is
     * being stopped and disconnected: adb may still list it (a failed `adb
     * connect` leaves it "offline"), yet it must not be served or reconnected.
     */
    state: 'connecting' | 'active' | 'releasing'
}

export type LossReason = 'connection_lost' | 'stuck'

/* Why a device that failed to recover is disconnected */
export type RecoveryFailure = 'offline' | 'worker_failed'

export class ConflictError extends Error {}

export interface RemoteDeviceManagerOptions {
    providerName: string
    tracker: ADBObserver
    /* Stops and forgets the worker of a device, if any */
    removeWorker: (serial: string) => Promise<void>
    /* How long a freshly connected device may take to become usable */
    connectTimeoutMs?: number
    /* How long an established device may stay offline or without a worker before it is disconnected */
    recoveryTimeoutMs?: number
    webhooks?: WebhookHub
}

/* Worker release reasons normalized for webhook consumers */
const RELEASE_REASONS: Record<string, string> = {
    ungroup_request: 'manual',
    automatic_timeout: 'idle_timeout',
    timeout: 'idle_timeout'
}

/*
 * Devices connected on demand through the provider API (`adb connect host:port`).
 * The provider never runs `adb connect` for them again: a failed connection is
 * reported once and the device is forgotten. An established device may still
 * blink offline (the adb server retries TCP devices on its own) or lose its
 * worker; it is given `recoveryTimeoutMs` to get a ready worker back before
 * it is disconnected. State lives in memory only.
 */
export class RemoteDeviceManager {
    readonly webhooks: WebhookHub
    private devices = new Map<string, RemoteDevice>()
    private releases = new Map<string, Promise<void>>()
    /* Email of the user who owns a device, as reported by its worker */
    private owners = new Map<string, string>()
    /* Devices waiting for a ready worker, with the timer that gives up on them */
    private recoveries = new Map<string, NodeJS.Timeout>()
    private readonly tracker: ADBObserver
    private readonly removeWorker: (serial: string) => Promise<void>
    private readonly connectTimeoutMs: number
    private readonly recoveryTimeoutMs: number

    constructor(options: RemoteDeviceManagerOptions) {
        this.tracker = options.tracker
        this.removeWorker = options.removeWorker
        this.webhooks = options.webhooks ?? new WebhookHub(options.providerName)
        this.connectTimeoutMs = options.connectTimeoutMs ?? 15_000
        this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? 30_000
    }

    has(serial: string) {
        return this.devices.has(serial)
    }

    /* Being stopped and disconnected: the provider must neither serve nor reconnect it */
    isReleasing(serial: string) {
        return this.devices.get(serial)?.state === 'releasing'
    }

    list() {
        return Array.from(this.devices.values())
    }

    forkOverrides(serial: string): DeviceForkOverrides | undefined {
        const device = this.devices.get(serial)
        if (!device) {
            return undefined
        }

        return {
            silent: device.silent,
            silentAllowedEmail: device.emails,
            groupTimeout: device.idleTtl,
            connectUrl: device.connectCommand ?? device.connectUrl,
            groupId: device.groupId,
            hideHeader: device.hideHeader
        }
    }

    /* Registers the device and connects it in the background */
    connect(request: ConnectRequest): RemoteDevice {
        const serial = deviceSerial(request.host, request.port)
        if (this.devices.has(serial) || this.tracker.getDevice(serial)) {
            throw new ConflictError(`Device "${serial}" is already connected`)
        }

        const device: RemoteDevice = {...request, serial, state: 'connecting'}
        this.devices.set(serial, device)
        this.tracker.setAutoReconnect(serial, false)
        if (device.webhook) {
            this.webhooks.subscribe(serial, device.webhook)
        }

        log.info('Connecting remote device "%s"', serial)
        void this.establish(device)

        return device
    }

    /* Disconnects in the background. Returns the serial, null for a device not connected through the API */
    disconnect(host: string, port: number): string | null {
        const serial = deviceSerial(host, port)
        if (!this.devices.has(serial)) {
            return null
        }

        void this.release(serial, {reason: 'api'})
        return serial
    }

    workerReady(serial: string) {
        if (!this.isServed(serial)) {
            return
        }

        if (this.cancelRecovery(serial)) {
            log.info('Remote device "%s" recovered', serial)
        }
        this.webhooks.emit(serial, 'device.ready')
    }

    workerState(serial: string, message: {state: 'busy' | 'idle', email?: string, reason?: string}) {
        if (!this.isServed(serial)) {
            return
        }

        if (message.state === 'busy') {
            if (message.email && this.owners.get(serial) === message.email) {
                return
            }
            this.owners.set(serial, message.email ?? '')
            this.webhooks.emit(serial, 'device.acquired', {email: message.email})
            return
        }

        this.released(serial, (message.reason && RELEASE_REASONS[message.reason]) ?? message.reason)
    }

    /* The worker of a device died. The process manager restarts it on its own */
    workerFailed(serial: string) {
        this.startRecovery(serial, 'worker failed')
    }

    /* adb reports an established device in a state other than "device" */
    deviceOffline(serial: string, state: string) {
        this.startRecovery(serial, `adb state "${state}"`)
    }

    /*
     * The device is not usable for now: whoever owned it has lost it. It is
     * disconnected unless a worker gets ready again within `recoveryTimeoutMs`.
     */
    private startRecovery(serial: string, cause: string) {
        if (this.devices.get(serial)?.state !== 'active') {
            return
        }

        this.released(serial, 'device_absent')
        if (this.recoveries.has(serial)) {
            return
        }

        log.warn('Remote device "%s" is down [%s], waiting for it to recover', serial, cause)
        this.recoveries.set(serial, setTimeout(() => {
            this.recoveries.delete(serial)
            const state = this.tracker.getDevice(serial)?.type
            const reason: RecoveryFailure = state === 'device' ? 'worker_failed' : 'offline'
            log.warn('Remote device "%s" did not recover [%s]', serial, reason)
            void this.release(serial, reason === 'offline' ? {reason, state: state ?? 'absent'} : {reason})
        }, this.recoveryTimeoutMs))
    }

    /* Returns whether the device was recovering */
    private cancelRecovery(serial: string) {
        const timer = this.recoveries.get(serial)
        clearTimeout(timer)
        return this.recoveries.delete(serial)
    }

    /* Reports the release of an owned device once, whoever notices it first */
    private released(serial: string, reason?: string) {
        const email = this.owners.get(serial)
        if (email === undefined) {
            return
        }

        this.owners.delete(serial)
        this.webhooks.emit(serial, 'device.released', {email: email || undefined, reason})
    }

    /* An API device the provider still serves: a device being released reports nothing more */
    private isServed(serial: string) {
        const state = this.devices.get(serial)?.state
        return state === 'connecting' || state === 'active'
    }

    /*
     * The device of an established API connection is gone or unusable.
     * Returns whether it was handled here; while connecting, the connect flow
     * reports failures itself.
     */
    async deviceLost(serial: string, reason: LossReason, data: Record<string, unknown> = {}): Promise<boolean> {
        if (this.devices.get(serial)?.state !== 'active') {
            return false
        }

        log.warn('Remote device "%s" lost [%s]', serial, reason)
        await this.release(serial, {reason, ...data})
        return true
    }

    /* API devices must not outlive the provider: nobody would own them */
    async shutdown() {
        await Promise.all(this.list().map(device => this.release(device.serial, {reason: 'provider_shutdown'})))
    }

    private async establish(device: RemoteDevice) {
        // Released (and maybe registered again) while we were waiting
        const isCurrent = () => this.devices.get(device.serial) === device && device.state !== 'releasing'

        try {
            await this.tracker.connect(device.host, device.port)
        }
        catch (err) {
            return this.failConnect(device, err, isCurrent)
        }

        if (!isCurrent()) {
            // The release may have disconnected before adb connected: don't leave
            // an orphan connection behind, unless the serial was registered again
            const replaced = this.devices.has(device.serial) && this.devices.get(device.serial) !== device
            if (!replaced) {
                await this.tracker.disconnect(device.host, device.port).catch(() => {})
            }
            return
        }

        try {
            await this.waitUntilUsable(device.serial)
        }
        catch (err) {
            return this.failConnect(device, err, isCurrent)
        }

        if (!isCurrent()) {
            return
        }

        device.state = 'active'
        log.info('Remote device "%s" connected', device.serial)
        this.webhooks.emit(device.serial, 'device.connected')
    }

    private async failConnect(device: RemoteDevice, err: any, isCurrent: () => boolean) {
        if (!isCurrent()) {
            return
        }

        const reason = err?.message || String(err)
        log.warn('Unable to connect remote device "%s": %s', device.serial, reason)
        await this.release(device.serial, {reason}, 'device.connect_failed')
    }

    private async waitUntilUsable(serial: string) {
        const deadline = Date.now() + this.connectTimeoutMs
        while (Date.now() < deadline) {
            if (this.tracker.getDevice(serial)?.type === 'device') {
                return
            }
            await new Promise(resolve => setTimeout(resolve, 500))
        }

        const device = this.tracker.getDevice(serial)
        throw new Error(device ? `device is "${device.type}"` : 'device did not appear in adb')
    }

    /*
     * Report, stop the worker, drop the adb connection and only then forget the
     * device. Idempotent: a second call waits for the release in progress.
     */
    private release(
        serial: string,
        data: Record<string, unknown>,
        event: 'device.disconnected' | 'device.connect_failed' = 'device.disconnected'
    ): Promise<void> {
        const inProgress = this.releases.get(serial)
        if (inProgress) {
            return inProgress
        }

        const device = this.devices.get(serial)
        if (!device) {
            return Promise.resolve()
        }

        log.info('Releasing remote device "%s"', serial)
        this.cancelRecovery(serial)
        this.released(serial, 'device_absent')
        device.state = 'releasing'
        this.webhooks.emit(serial, event, data)
        this.webhooks.unsubscribe(serial)

        const release = this.stopAndDisconnect(device).finally(() => {
            this.devices.delete(serial)
            this.releases.delete(serial)
            this.owners.delete(serial)
            this.tracker.setAutoReconnect(serial, true)
        })
        this.releases.set(serial, release)
        return release
    }

    private async stopAndDisconnect(device: RemoteDevice) {
        try {
            await this.removeWorker(device.serial)
        }
        catch (err: any) {
            log.error('Error removing worker of remote device "%s": %s', device.serial, err?.message || err)
        }

        try {
            await this.tracker.disconnect(device.host, device.port)
        }
        catch (err: any) {
            log.warn('Unable to disconnect remote device "%s": %s', device.serial, err?.message || err)
        }
    }
}
