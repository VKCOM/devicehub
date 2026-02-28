import _ from 'lodash'
import logger from '../../util/logger.js'
import lifecycle from '../../util/lifecycle.js'
import {Esp32Touch} from '../ios-device/plugins/touch/esp32touch.js'
import IOSObserver from './IOSObserver.js'
import {ChildProcess} from 'node:child_process'
import {ProcessManager, ResourcePool} from '../../util/ProcessManager.js'
import wireutil from '../../wire/util.js'
import {
    DeviceRegisteredMessage,
    DeviceAbsentMessage,
    DeviceStatusMessage,
    DeviceIosIntroductionMessage,
    ProviderIosMessage,
    DeviceStatus
} from '../../wire/wire.js'
import srv from '../../util/srv.js'
import * as zmqutil from '../../util/zmqutil.js'
import {WireRouter} from "../../wire/router.js";

// Device-specific context for process management
interface DeviceContext {
    udid: string
    isSimulator: boolean
    register: Promise<void>
    resolveRegister?: () => void
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
        push: string[]
        sub: string[]
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

    let usedEsp32: PortInfo[] = []
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

    const solo = wireutil.makePrivateChannel()

    // Output
    const push = zmqutil.socket('push')
    try {
        await Promise.all(options.endpoints.push.map(async(endpoint) => {
            const records = await srv.resolve(endpoint)
            return srv.attempt(records, (record) => {
                log.info('Sending output to "%s"', record.url)
                push.connect(record.url)
            })
        }))
    }
    catch (err) {
        log.fatal('Unable to connect to push endpoint: %s', err)
        lifecycle.fatal()
    }

    // Input
    const sub = zmqutil.socket('sub')
    try {
        await Promise.all(options.endpoints.sub.map(async(endpoint) => {
            const records = await srv.resolve(endpoint)
            return srv.attempt(records, (record) => {
                log.info('Receiving input to "%s"', record.url)
                sub.connect(record.url)
            })
        }))

        log.info('Subscribing to permanent channel "%s"', solo)
        sub.subscribe(solo)
    }
    catch (err) {
        log.fatal('Unable to connect to sub endpoint: %s', err)
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
            push.send([
                wireutil.global,
                wireutil.pack(DeviceStatusMessage, {
                    serial: id,
                    status: DeviceStatus.PREPARING
                })
            ])

            const esp32ToUse = _.sample(_.differenceBy(curEsp32, usedEsp32, 'path'))
            if (esp32ToUse) {
                usedEsp32.push(esp32ToUse)
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
        onCleanup: (id, context) => {
            // Resolve register if pending
            context.resolveRegister?.()

            // Tell others the device is gone
            push.send([
                wireutil.global,
                wireutil.pack(DeviceAbsentMessage, { serial: id })
            ])
        }
    }, {
        killTimeout: options.killTimeout,
        healthCheckConfig: {
            startupTimeoutMs: STARTUP_TIMEOUT_MS
        },
        resourcePool: portPool
    })

    // Handle device registration messages
    sub.on('message', new WireRouter()
        .on(DeviceRegisteredMessage, (channel, message: {serial: string}) => {
            const process = processManager.get(message.serial)
            process?.context?.resolveRegister?.()
        })
        .handler()
    )

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

    // Tell others we found a device
    const register = (udid: string) => new Promise<void>(
        async(resolve, reject) => {
            log.info('Registering device "%s"', udid)

            push.send([
                wireutil.global,
                wireutil.pack(DeviceIosIntroductionMessage, {
                    serial: udid,
                    status: wireutil.toDeviceStatus('device'),
                    provider: ProviderIosMessage.create({
                        channel: solo,
                        name: options.name
                    })
                })
            ])

            process.nextTick(() => { // after creating process context
                const managedProcess = processManager.get(udid)
                if (!managedProcess) return

                const timeout = setTimeout(() => reject('Register timeout'), BASE_DELAY)
                managedProcess.context.resolveRegister = () => {
                    clearTimeout(timeout)
                    delete managedProcess?.context?.resolveRegister
                    resolve()
                }
            })
        }
    )

    const startDeviceWork = async(udid: string, restart = false, reRegister = false) => {
        if (!processManager.has(udid)) return stats(false)

        const managedProcess = processManager.get(udid)
        if (!managedProcess) return

        if (restart || reRegister) {
            log.warn('Trying to %s device again, delay 10 sec [%s]', restart ? 'start' : 'register', udid)
            await new Promise(r => setTimeout(r, BASE_DELAY))
        }

        log.info('Starting work for device "%s"', udid)

        if (reRegister) {
            managedProcess.context.register = register(udid)
        }

        if (!restart) {
            try {
                // Wait for registration
                await managedProcess.context.register
                log.info('Device "%s" registered successfully', udid)
            }
            catch (err: any) {
                log.error('Device "%s" registration failed: %s', udid, err?.message)
                return startDeviceWork(udid, false, true)
            }
        }

        // Start the process (this will spawn and wait for ready)
        const started = await processManager.start(udid)

        if (!started) {
            log.error('Failed to start device process [%s]', udid)
            return startDeviceWork(udid, true, false)
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

            // Create device context with registration promise
            const deviceContext: DeviceContext = {
                udid, isSimulator, register: Promise.resolve()
            }

            // Create managed process
            const process = await processManager.create(udid, deviceContext, {
                initialState: 'waiting',
                resourceCount: 1
            })

            if (!process) {
                log.error('Failed to create process for device "%s"', udid)
                return
            }

            // Register device immediately, before 'running' state
            deviceContext.register = register(udid)

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

        ;[push, sub].forEach((sock) =>
            sock.close()
        )

        // Clean up all processes
        return processManager.cleanup()
    })
}
