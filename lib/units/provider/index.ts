import logger from '../../util/logger.js'
import lifecycle from '../../util/lifecycle.js'
import srv from '../../util/srv.js'
import {ChildProcess} from 'node:child_process'
import ADBObserver, {ADBDevice, isOnline} from './ADBObserver.js'
import {ProcessManager, ResourcePool} from '../../util/ProcessManager.js'
import {DeviceForkOverrides, RemoteDeviceManager} from './remote-devices/manager.js'
import {createProviderApi} from './remote-devices/api.js'

type DeviceHandler = (device: ADBDevice, oldType?: ADBDevice['type']) => any | Promise<any>

export interface Options {
    name: string
    adbHost: string
    adbPort: number
    /* Restart the local ADB server via `adbPath` when it goes down */
    adbAutostart: boolean
    adbPath: string
    /* Minutes of idle time after which a device is force-reconnected. 0 = off */
    idleDeviceReconnect: number
    ports: number[]
    allowRemote: boolean
    killTimeout: number
    deviceType: string
    endpoints: {
        // processor ROUTER endpoint(s) — resolved once at startup via SRV
        // weighted selection. The winning URL is passed to every forked device
        // so all devices under this provider share one processor.
        processor: string[]
    }
    filter: (serial: string) => boolean
    fork: (serial: string, ports: number[], processorEndpoint: string, overrides?: DeviceForkOverrides) => ChildProcess
    /* HTTP API for connecting remote devices. Disabled when null */
    api?: {
        host: string
        port: number
        /* How long a freshly connected remote device may take to become usable */
        connectTimeoutMs?: number
        /* How long an established remote device may stay offline or without a ready worker */
        recoveryTimeoutMs?: number
    } | null
}

export interface Provider {
    /* Graceful shutdown, also run on process exit */
    stop: () => Promise<void>
}

export default async (options: Options): Promise<Provider | undefined> => {
    const log = logger.createLogger('provider')

    // Startup timeout for device process
    const STARTUP_TIMEOUT_MS = 10 * 60 * 1000
    const BASE_DELAY = 10_000
    const RESOURCE_ALLOCATION_COUNT = 2

    // Check whether the ipv4 address contains a port indication
    if (options.adbHost.includes(':')) {
        log.error('Please specify adbHost without port')
        lifecycle.fatal()
    }

    // Resolve all endpoints, flatten records, pick first via srv.attempt.
    // Failover between records works only with srv+tcp:// (DNS-level selection).
    // Plain tcp:// always resolves to one record — ZMQ handles reconnects itself.
    // All forked devices get the same URL — one processor per provider.
    let selectedProcessorEndpoint: string
    try {
        const allRecords = (
            await Promise.all(options.endpoints.processor.map(e => srv.resolve(e)))
        ).flat()
        selectedProcessorEndpoint = await srv.attempt(allRecords, (record) => {
            log.info('Provider "%s": devices will connect to processor "%s"', options.name, record.url)
            return record.url
        })
    }
    catch (err: any) {
        log.fatal('Unable to resolve processor endpoint: %s', err?.message || err)
        lifecycle.fatal()
        return undefined
    }

    // To make sure that we always bind the same type of service to the same
    // port, we must ensure that we allocate ports in fixed groups.
    options.ports = options.ports.slice(0, options.ports.length - options.ports.length % RESOURCE_ALLOCATION_COUNT)

    // Resource pool for port allocation
    const portPool = new ResourcePool<number>(options.ports)

    const processManager = new ProcessManager<ADBDevice, number>({
        spawn: (id, context, resources) => {
            log.info('Spawning device process "%s" with ports [%s]', id, resources.join(', '))
            return options.fork(id, resources, selectedProcessorEndpoint, remoteDevices.forkOverrides(id))
        },
        onReady: (id) => {
            log.info('Device process "%s" is ready', id)
            remoteDevices.workerReady(id)
        },
        onError: (id, context, error) => {
            log.error('Device process "%s" error: %s', id, error.message)
            // A dead worker holds no session; the process manager restarts it
            tracker.setBusy(id, false)
            remoteDevices.workerFailed(id)
        },
        onCleanup: (id) => {
            log.info('Device process "%s" cleaned up', id)
        },
        /*
         * A worker dies when adb loses its device. Respawning it on a device that
         * is not usable only makes it die again: it is started once adb reports
         * the device back (see the 'update' handler). Ask adb now: the last poll
         * may predate the loss.
         */
        shouldRestart: async(id) => {
            await tracker.refresh().catch(err => log.warn('Unable to refresh adb devices: %s', err?.message))
            return tracker.getDevice(id)?.type === 'device'
        },
        onMessage: (id, context, message: any) => {
            if (message?.type !== 'device-state') {
                log.warn(`Unknown message from device "${id}": ${JSON.stringify(message)}`)
                return
            }

            // Pause/resume ADB health checks and idle reconnects for this
            // device so we never interfere with an active session.
            tracker.setBusy(id, message.state === 'busy')
            log.info('Device "%s" is now %s', id, message.state)
            remoteDevices.workerState(id, message)
        }
    }, {
        killTimeout: options.killTimeout,
        healthCheckConfig: {
            startupTimeoutMs: STARTUP_TIMEOUT_MS
        },
        resourcePool: portPool
    })

    let statsTimer: NodeJS.Timeout
    const stats = (twice = true) => {
        const processStats = processManager.getStats()

        log.info(`Providing ${processStats.running.length} of ${processStats.total} device(s); starting: [${
            processStats.starting.join(', ')
        }], waiting: [${
            processStats.waiting.join(', ')
        }]`)
        log.info(`Providing all ${processStats.total} of ${tracker.count} device(s)`)

        if (twice) {
            clearTimeout(statsTimer)
            statsTimer = setTimeout(stats, BASE_DELAY, false)
        }
    }

    // Helper for ignoring unwanted devices
    const filterDevice = (listener: DeviceHandler) => (
        (device: ADBDevice, oldType?: ADBDevice['type']) => {
            if (device.serial === '????????????' || !device.serial?.trim()) {
                log.warn('ADB lists a weird device: "%s"', device.serial)
                return false
            }
            // Being released by the API: adb may still list it, but it is not ours to serve
            if (remoteDevices.isReleasing(device.serial)) {
                return false
            }
            // Explicitly requested through the API
            if (remoteDevices.has(device.serial)) {
                return listener(device, oldType)
            }
            if (!options.allowRemote && device.serial.includes(':')) {
                log.info('Filtered out remote device "%s", use --allow-remote to override', device.serial)
                return false
            }
            if (options.filter && !options.filter(device.serial)) {
                log.info('Filtered out device "%s"', device.serial)
                return false
            }
            return listener(device, oldType)
        }
    )

    /* Stops the worker of a device and frees its ports. Shared by ADB-found and API devices */
    const removeWorker = async(serial: string) => {
        if (!processManager.has(serial)) {
            return
        }

        try {
            log.info('Removing device %s', serial)
            await processManager.remove(serial)
        }
        catch (err) {
            log.error('Error removing device process "%s": %s', serial, err)
        }
    }

    const startDeviceWork = async(device: ADBDevice, restart = false) => {
        if (!processManager.has(device.serial)) return stats(false)

        const managedProcess = processManager.get(device.serial)
        if (!managedProcess) return

        if (restart) {
            log.warn('Trying to start device again, delay 10 sec [%s]', device.serial)
            await new Promise(r => setTimeout(r, BASE_DELAY))
        }

        // Not usable (any more): the 'update' handler starts it once adb reports it back
        if (tracker.getDevice(device.serial)?.type !== 'device') {
            log.info('Device "%s" is not ready in adb, waiting for it', device.serial)
            return stats(false)
        }

        log.info('Starting work for device "%s"', device.serial)

        const started = await processManager.start(device.serial)

        if (!started) {
            log.error('Failed to start device process [%s]', device.serial)
            return startDeviceWork(device, true)
        }

        stats()
    }

    // Track and manage devices
    const tracker = new ADBObserver({
        intervalMs: 3000,
        port: options.adbPort,
        host: options.adbHost,
        adbAutostart: options.adbAutostart,
        adbPath: options.adbPath,
        idleReconnectMinutes: options.idleDeviceReconnect
    })

    // Devices connected on demand through the provider API
    const remoteDevices = new RemoteDeviceManager({
        providerName: options.name,
        tracker,
        removeWorker,
        connectTimeoutMs: options.api?.connectTimeoutMs,
        recoveryTimeoutMs: options.api?.recoveryTimeoutMs
    })

    if (options.adbAutostart) {
        log.info('ADB server autostart is enabled (adb path: "%s")', options.adbPath)
    }

    if (options.idleDeviceReconnect > 0) {
        log.info('Idle devices will be reconnected every %s minute(s)', options.idleDeviceReconnect)
    }

    tracker.on('idle-reconnect', (device, info) => {
        log.info(
            `Reconnected idle device "${device.serial}" after ${
                Math.floor(info.idleMs / 60_000)
            } minute(s) [ok: ${info.ok}]`
        )
    })

    tracker.on('healthcheck', async(stats) => {
        log.info('Healthcheck [OK: %s, BAD: %s]', stats.ok, stats.bad)

        const stuckProcesses = processManager.checkHealth()
        for (const serial of stuckProcesses) {
            log.error('Restarting stuck worker "%s"', serial)

            try {
                if (await remoteDevices.deviceLost(serial, 'stuck')) {
                    continue
                }

                if (tracker.getDevice(serial)) {
                    await removeWorker(serial)
                }
            }
            catch (err) {
                log.error('Error restarting stuck worker "%s": %s', serial, err)
            }
        }
    })

    log.info('Tracking devices')

    tracker.on('connect', filterDevice(async(device) => {
        if (processManager.has(device.serial)) {
            log.warn('Device has been connected twice. Skip.')
            return
        }

        log.info('Connected device "%s" [%s]', device.serial, device.type)
        const created = await processManager.create(device.serial, device, {
            initialState: 'waiting',
            resourceCount: RESOURCE_ALLOCATION_COUNT // Allocate 2 ports per device
        })

        if (!created) {
            log.error('Failed to create process for device "%s"', device.serial)
            return
        }

        stats()

        if (device.type === 'device') {
            startDeviceWork(device)
            return
        }

        // API devices are never reconnected: the manager waits for them and gives up on its own
        if (remoteDevices.has(device.serial)) {
            return
        }

        // Try to reconnect device if it is not available for more than 30
        // seconds. Applies to USB devices too: ADBObserver reconnects those
        // with `reconnect` instead of disconnect/connect.
        const timer = setTimeout(serial => {
            const device = tracker.getDevice(serial)
            if (device && !isOnline(device?.type)) {
                device.reconnect()
            }
        }, 30_000, device.serial)

        processManager.setTimer(device.serial, timer)
    }))

    tracker.on('update', filterDevice(async(device, oldType) => {
        log.info('Device "%s" is now "%s" (was "%s")', device.serial, device.type, oldType)

        if (device.type !== 'device') {
            // API devices get a while to come back, then they are disconnected
            remoteDevices.deviceOffline(device.serial, device.type)

            // Device went offline - stop worker but keep it in waiting state
            log.info('Device "%s" went offline [%s]', device.serial, device.type)

            const managedProcess = processManager.get(device.serial)
            if (managedProcess && managedProcess.state !== 'waiting') {
                try {
                    await processManager.stop(device.serial)
                }
                catch (err) {
                    log.error('Error stopping device worker "%s": %s', device.serial, err)
                }

                // Set back to waiting state (keep process and ports allocated)
                processManager.setState(device.serial, 'waiting')
            }
            return
        }

        const managedProcess = processManager.get(device.serial)
        if (device.type === 'device' && managedProcess?.state !== 'running') {
            // Immediately cancel device unreachable timeout
            processManager.clearTimer(device.serial)

            startDeviceWork(device)
        }
    }))

    tracker.on('stuck', async(device, health) => {
        if (await remoteDevices.deviceLost(device.serial, 'stuck')) {
            return
        }

        if (!processManager.has(device.serial)) {
            log.warn('Device %s is stuck, but process is not running', device.serial)
            return
        }

        log.warn(
            'Device %s is stuck [attempts: %s, first_healthcheck: %s, last_healthcheck: %s]',
            device.serial,
            new Date(health.firstFailureTime).toISOString(),
            new Date(health.lastAttemptTime).toISOString()
        )

        removeWorker(device.serial)
    })

    tracker.on('disconnect', filterDevice(async(device) => {
        log.info('Device is disconnected "%s" [%s]', device.serial, device.type)

        if (await remoteDevices.deviceLost(device.serial, 'connection_lost')) {
            return
        }

        if (!processManager.has(device.serial)) {
            log.warn(
                'Device is disconnected, but process is not running %s',
                device.isStuck ? '[Device got stuck earlier]' : ''
            )
            return
        }

        if (!device.isStuck) {
            removeWorker(device.serial)
        }
    }))

    tracker.on('error', err => {
        log.error('ADBObserver error: %s', err?.message)
    })

    tracker.start()

    const api = options.api && createProviderApi({
        host: options.api.host,
        port: options.api.port,
        providerName: options.name,
        devices: remoteDevices
    })

    if (api) {
        try {
            await api.listen()
        }
        catch (err: any) {
            log.fatal('Unable to start provider API: %s', err?.message || err)
            lifecycle.fatal()
            return undefined
        }
    }

    const shutdown = async() => {
        // Clear timers
        clearTimeout(statsTimer)

        await api?.close()
        await remoteDevices.shutdown()

        stats(false)
        tracker.destroy()

        // Clean up all processes
        await processManager.cleanup()
    }

    // Both the lifecycle and the caller may ask; shut down once
    let stopping: Promise<void> | undefined
    const stop = () => {
        stopping ??= shutdown()
        return stopping
    }

    lifecycle.observe(stop)

    return {stop}
}
