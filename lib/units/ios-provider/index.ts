import _ from 'lodash'
import logger from '../../util/logger.js'
import lifecycle from '../../util/lifecycle.js'
import {Esp32Touch} from '../ios-device/plugins/touch/esp32touch.js'
import IOSObserver from './IOSObserver.js'
import {ChildProcess} from 'node:child_process'
import {ProcessManager, ResourcePool} from '../../util/ProcessManager.js'
import srv from '../../util/srv.js'

// Device-specific context for process management
interface DeviceContext {
    udid: string
    isSimulator: boolean
}

interface ResourceType {
    screenListenPort: number
    screenPort: number
    connectPort: number
    wdaPort: number
}

// Type from @serialport/bindings-interface
interface PortInfo {
    path: string
    manufacturer: string | undefined
    serialNumber: string | undefined
    pnpId: string | undefined
    locationId: string | undefined
    productId: string | undefined
    vendorId: string | undefined
}

type DeviceHandler = (udid: string, simulator: boolean) => any | Promise<any>

interface Options {
    name: string
    wdaPorts: number[]
    screenListenPorts: number[]
    screenWsPorts: number[]
    connectPorts: number[]
    usbmuxPath: string
    filter: null | ((serial: string) => boolean)
    screenWsUrlPattern: string
    killTimeout: number
    publicIp: string
    endpoints: {
        // processor ROUTER endpoint(s) — resolved once at startup to fail fast
        // on misconfiguration. Each forked ios-device connects over its own
        // DEALER (identity = deviceKey); the processor derives presence from that.
        processor: string[]
    }
    fork: (serial: string, opts: {
        wdaPort: number
        screenPort: number
        screenListenPort: number
        connectPort: number
        isSimulator: boolean
        esp32Path?: string
    }) => ChildProcess
}

export default async (options: Options): Promise<void> => {
    const log = logger.createLogger('ios-provider')

    // Startup timeout for device process
    const STARTUP_TIMEOUT_MS = 10 * 60 * 1000
    const BASE_DELAY = 10_000

    // ESP32 touch devices currently handed to a running ios-device, keyed by
    // udid for O(1) release in onCleanup.
    const usedEsp32 = new Map<string, PortInfo>()
    let curEsp32: PortInfo[] = []

    // TODO: refactoring needed
    let espTimer: NodeJS.Timeout
    const espObserver = async() => {
        // Listen for iMouseDevices
        const newDevices = await Esp32Touch.listPorts() as PortInfo[]
        const diffAdd = _.differenceBy(newDevices, curEsp32, 'path')
        const diffRemove = _.differenceBy(curEsp32, newDevices, 'path')

        diffAdd.forEach((dev) => {
            log.info(
                `Added ESP32 to the pool. path=%s, productId=%s, manufacturer=%s`,
                dev.path, dev.productId, dev.manufacturer
            )
        })

        diffRemove.forEach((dev) => {
            log.info(
                `Removed ESP32 from the pool. path=%s, productId=%s, manufacturer=%s`,
                dev.path, dev.productId, dev.manufacturer
            )
        })

        curEsp32 = newDevices
        espTimer = setTimeout(() => espObserver(), 2500)
    }

    // The provider spawns and supervises ios-device processes but opens no ZMQ
    // socket itself. Devices self-register over their own DEALER on startup.
    // Resolve the processor endpoint once so a bad configuration fails loudly.
    try {
        await Promise.all(options.endpoints.processor.map(async(endpoint) => {
            const records = await srv.resolve(endpoint)
            return srv.attempt(records, (record) => {
                log.info('iOS devices will connect to processor "%s"', record.url)
                return true
            })
        }))
    }
    catch (err: any) {
        log.fatal('Unable to resolve processor endpoint: %s', err?.message || err)
        lifecycle.fatal()
    }

    // Resource pool for port allocation
    const portPool = new ResourcePool<ResourceType>(
        options.wdaPorts.map((wdaPort, i) => ({
            screenListenPort: options.screenListenPorts[i],
            connectPort: options.connectPorts[i],
            screenPort: options.screenWsPorts[i],
            wdaPort
    })))

    // Create ProcessManager for device workers
    const processManager = new ProcessManager<DeviceContext, ResourceType>({
        spawn: async(id, context, [resource]) => {
            log.info('Spawning device process "%s" with ports [%s]', id, Object.values(resource).join(', '))

            const esp32ToUse = _.sample(_.differenceBy(curEsp32, [...usedEsp32.values()], 'path'))
            if (esp32ToUse) {
                usedEsp32.set(id, esp32ToUse)
                log.info(`Using ${esp32ToUse.path} ESP32`)
            }

            return options.fork(id, {
                ...resource,
                isSimulator: context.isSimulator,
                esp32Path: esp32ToUse?.path
            })
        },
        onReady: (id) => {
            log.info('iOS Device process "%s" is ready', id)
        },
        onError: (id, context, error) => {
            log.error('iOS Device process "%s" error: %s', id, error.message)
        },
        onCleanup: (id) => {
            // Release the ESP32 this device held back to the pool.
            // onCleanup runs from ProcessManager.stop() on every removal path.
            const freed = usedEsp32.get(id)
            if (freed) {
                usedEsp32.delete(id)
                log.info(`Released ESP32 ${freed.path} from device "${id}"`)
            }
            // The ios-device's own heartbeat stops when its process dies;
            // the processor reaps it on timeout.
            log.info('iOS device process "%s" cleaned up', id)
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

        log.info(`Providing ${processStats.running.length} of ${processStats.total} iOS device(s); starting: [${
            processStats.starting.join(', ')
        }], waiting: [${
            processStats.waiting.join(', ')
        }]`)

        if (twice) {
            clearTimeout(statsTimer)
            statsTimer = setTimeout(stats, BASE_DELAY, false)
        }
    }

    // Helper for ignoring unwanted devices
    const filterDevice = (listener: DeviceHandler) => (
        (udid: string, simulator: boolean) => {
            if (!udid?.trim()) {
                log.warn('Weird iOS device: "%s"', udid)
                return false
            }
            if (options.filter && !options.filter(udid)) {
                log.info('Filtered out iOS device "%s"', udid)
                return false
            }
            return listener(udid, simulator)
        }
    )

    const removeDevice = async(udid: string) => {
        try {
            log.info('Removing device %s', udid)
            await processManager.remove(udid)
        }
        catch (err) {
            log.error('Error removing device process "%s": %s', udid, err)
        }
    }

    const startDeviceWork = async(udid: string, restart = false) => {
        if (!processManager.has(udid)) return stats(false)

        const managedProcess = processManager.get(udid)
        if (!managedProcess) return

        if (restart) {
            log.warn('Trying to start device again, delay 10 sec [%s]', udid)
            await new Promise(r => setTimeout(r, BASE_DELAY))
        }

        log.info('Starting work for device "%s"', udid)

        // Start the process (spawn and wait for ready). The ios-device
        // self-registers over its own DEALER once it comes up.
        const started = await processManager.start(udid)

        if (!started) {
            log.error('Failed to start device process [%s]', udid)
            return startDeviceWork(udid, true)
        }

        stats()
    }

    const onAttach = filterDevice(
        async(udid: string, isSimulator: boolean) => {
            if (processManager.has(udid)) {
                log.warn('Device has been connected twice. Skip.')
                return
            }

            log.info('Connected device "%s" [%s]', udid, isSimulator ? 'simulator' : 'physical')

            // Create managed process
            const process = await processManager.create(udid, {udid, isSimulator}, {
                initialState: 'waiting',
                resourceCount: 1
            })

            if (!process) {
                log.error('Failed to create process for device "%s"', udid)
                return
            }

            stats()
            startDeviceWork(udid)
        }
    )

    const onDetach = filterDevice(
        (udid: string) => {
            log.info(`Detached device ${udid}`)
            processManager.clearTimer(udid)
            removeDevice(udid)
        }
    )

    // TODO: add option.disallowSimulators (default: false)
    const iosObserver = new IOSObserver()
    iosObserver.on('attached', onAttach)
    iosObserver.on('detached', onDetach)
    iosObserver.listen()

    log.info('Listening for devices')

    lifecycle.observe(() => {
        // Clear timers
        clearTimeout(espTimer)
        clearTimeout(statsTimer)

        stats(false)

        // Clean up all processes
        return processManager.cleanup()
    })
}
