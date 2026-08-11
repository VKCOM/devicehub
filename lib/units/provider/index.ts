import logger from '../../util/logger.js'
import lifecycle from '../../util/lifecycle.js'
import srv from '../../util/srv.js'
import {ChildProcess} from 'node:child_process'
import ADBObserver, {ADBDevice} from './ADBObserver.js'
import {ProcessManager, ResourcePool} from '../../util/ProcessManager.js'

// Device-specific context for process management
interface DeviceContext {
    device: ADBDevice
}

type DeviceHandler = (device: ADBDevice, oldType?: ADBDevice['type']) => any | Promise<any>

export interface Options {
    name: string
    adbHost: string
    adbPort: number
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
    fork: (serial: string, ports: number[], processorEndpoint: string) => ChildProcess
}

export default async (options: Options): Promise<void> => {
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
        return
    }

    // To make sure that we always bind the same type of service to the same
    // port, we must ensure that we allocate ports in fixed groups.
    options.ports = options.ports.slice(0, options.ports.length - options.ports.length % RESOURCE_ALLOCATION_COUNT)

    // Resource pool for port allocation
    const portPool = new ResourcePool<number>(options.ports)

    const processManager = new ProcessManager<DeviceContext, number>({
        spawn: (id, context, resources) => {
            log.info('Spawning device process "%s" with ports [%s]', id, resources.join(', '))
            return options.fork(id, resources, selectedProcessorEndpoint)
        },
        onReady: (id) => {
            log.info('Device process "%s" is ready', id)
        },
        onError: (id, context, error) => {
            log.error('Device process "%s" error: %s', id, error.message)
        },
        onCleanup: (id) => {
            log.info('Device process "%s" cleaned up', id)
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

    const removeDevice = async(device: ADBDevice) => {
        try {
            log.info('Removing device %s', device.serial)
            await processManager.remove(device.serial)
        }
        catch (err) {
            log.error('Error removing device process "%s": %s', device.serial, err)
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
        host: options.adbHost
    })

    // TODO: add ADBObserver.enableHealthCheck(serial) to check only filtered devices
    tracker.on('healthcheck', async(stats) => {
        log.info('Healthcheck [OK: %s, BAD: %s]', stats.ok, stats.bad)

        // Check for stuck workers
        const stuckProcesses = processManager.checkHealth()

        // Stop and restart stuck workers
        for (const serial of stuckProcesses) {
            log.error('Restarting stuck worker "%s"', serial)

            try {
                const device = tracker.getDevice(serial)
                if (device) {
                    await removeDevice(device)
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

        // Create managed process
        const created = await processManager.create(device.serial, {device}, {
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

        // TODO: add options.unavailableTimeToReconnect (default: 30sec)
        // Try to reconnect device if it is not available for more than 30 seconds
        if (device.serial.includes(':')) {
            const timer = setTimeout(serial => {
                const device = tracker.getDevice(serial)
                if (device && !['device', 'emulator'].includes(device?.type)) {
                    device.reconnect()
                }
            }, 30_000, device.serial)

            processManager.setTimer(device.serial, timer)
        }
    }))

    tracker.on('update', filterDevice(async(device, oldType) => {
        log.info('Device "%s" is now "%s" (was "%s")', device.serial, device.type, oldType)

        if (!['device', 'emulator'].includes(device.type)) {
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
        log.warn(
            'Device %s is stuck [attempts: %s, first_healthcheck: %s, last_healthcheck: %s]',
            device.serial,
            new Date(health.firstFailureTime).toISOString(),
            new Date(health.lastAttemptTime).toISOString()
        )

        if (!processManager.has(device.serial)) {
            log.warn('Device is stuck, but process is not running')
            return
        }

        removeDevice(device)
    })

    tracker.on('disconnect', filterDevice(async(device) => {
        log.info('Device is disconnected "%s" [%s]', device.serial, device.type)

        if (!processManager.has(device.serial)) {
            log.warn(
                'Device is disconnected, but process is not running %s',
                device.isStuck ? '[Device got stuck earlier]' : ''
            )
            return
        }

        if (!device.isStuck) {
            removeDevice(device)
        }
    }))

    tracker.on('error', err => {
        log.error('ADBObserver error: %s', err?.message)
    })

    tracker.start()

    lifecycle.observe(() => {
        // Clear timers
        clearTimeout(statsTimer)

        stats(false)
        tracker.destroy()

        // Clean up all processes
        return processManager.cleanup()
    })
}
