import logger from '../../util/logger.js'
import wire from '../../wire/index.js'
import wireutil from '../../wire/util.js'
import {WireRouter} from '../../wire/router.js'
import * as procutil from '../../util/procutil.js'
import lifecycle from '../../util/lifecycle.js'
import srv from '../../util/srv.js'
import * as zmqutil from '../../util/zmqutil.js'
import db from '../../db/index.js'
import dbapi from '../../db/api.js'
import {ChildProcess} from 'node:child_process'
import ADBObserver, {ADBDevice} from './ADBObserver.js'

interface DeviceWorker {
    state: 'waiting' | 'running'
    time: number
    terminate: () => Promise<void> | void
    resolveRegister?: () => void
    register: Promise<void>
    waitingTimeoutTimer?: NodeJS.Timeout
}

export interface Options {
    name: string
    adbHost: string
    adbPort: number
    ports: number[]
    allowRemote: boolean
    killTimeout: number
    deviceType: string
    endpoints: {
        push: string[]
        sub: string[]
    }
    filter: (device: ADBDevice) => boolean
    fork: (device: ADBDevice, ports: number[]) => ChildProcess
}

export default (async function(options: Options) {
    const log = logger.createLogger('provider')
    await db.connect()

    // Check whether the ipv4 address contains a port indication
    if (options.adbHost.includes(':')) {
        log.error('Please specify adbHost without port')
        lifecycle.fatal()
    }

    const workers: Record<string, DeviceWorker> = {}

    const solo = wireutil.makePrivateChannel()

    // To make sure that we always bind the same type of service to the same
    // port, we must ensure that we allocate ports in fixed groups.
    let ports = options.ports.slice(0, options.ports.length - options.ports.length % 4)

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
        log.fatal('Unable to connect to push endpoint', err)
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

        ;[solo].forEach(function(channel) {
            log.info('Subscribing to permanent channel "%s"', channel)
            sub.subscribe(channel)
        })

        sub.on('message', new WireRouter()
            .on(wire.DeviceRegisteredMessage, (channel, message) => {
                if (workers[message.serial]?.resolveRegister) {
                    workers[message.serial].resolveRegister!()
                    delete workers[message.serial]?.resolveRegister
                }
            })
            .handler()
        )
    }
    catch (err) {
        log.fatal('Unable to connect to sub endpoint', err)
        lifecycle.fatal()
    }

    // Helper for ignoring unwanted devices
    const filterDevice = (listener: (device: ADBDevice, oldType?: ADBDevice['type']) => any | Promise<any>) =>
        ((device: ADBDevice, oldType?: ADBDevice['type']) => {
            if (device.serial === '????????????') {
                log.warn('ADB lists a weird device: "%s"', device.serial)
                return false
            }
            if (!options.allowRemote && device.serial.includes(':')) {
                log.info('Filtered out remote device "%s", use --allow-remote to override', device.serial)
                return false
            }
            if (options.filter && !options.filter(device)) {
                log.info('Filtered out device "%s"', device.serial)
                return false
            }
            return listener(device, oldType)
        }) as (device: ADBDevice, oldType?: ADBDevice['type']) => any | Promise<any>

    const stop = async(device: ADBDevice) => {
        if (workers[device.serial]) {
            log.info('Shutting down device worker "%s" [%s]', device.serial, device.type)
            return workers[device.serial].terminate()
        }
    }

    const register = (device: ADBDevice) => new Promise<void>(async(resolve) =>{
        log.info('Registering device')

        // Tell others we found a device
        push.send([
            wireutil.global,
            wireutil.envelope(new wire.DeviceIntroductionMessage(device.serial, wireutil.toDeviceStatus(device.type), new wire.ProviderMessage(solo, options.name)))
        ])

        dbapi.setDeviceType(device.serial, options.deviceType)
        process.nextTick(() => { // after creating workers[device.serial] obj
            if (workers[device.serial]) {
                workers[device.serial].resolveRegister = () => resolve()
            }
        })
    })

    const spawn = (device: ADBDevice, onReady: () => Promise<any> | any, onError: (error: any) => Promise<any> | any) => {
        if (!workers[device.serial]) { // when device disconnected - stop restart loop
            return
        }

        let allocatedPorts = ports.splice(0, 4)

        const proc = options.fork(device, allocatedPorts)
        log.info('Spawned a device worker')

        const exitListener = (code?: number, signal?: string) => {
            proc.removeAllListeners('exit')
            proc.removeAllListeners('error')
            proc.removeAllListeners('message')

            if (signal) {
                log.warn('Device worker "%s" was killed with signal %s, assuming ' +
                    'deliberate action and not restarting', device.serial, signal)

                if (workers[device.serial].state === 'running') {
                    workers[device.serial].terminate()
                }
                return
            }

            if (code === 0) {
                log.info('Device worker "%s" stopped cleanly', device.serial)
            }

            onError(new procutil.ExitError(code))
        }

        if (!workers[device.serial]) {
            procutil.gracefullyKill(proc, options.killTimeout)
            return
        }
        workers[device.serial].terminate = () => exitListener(0)

        const errorListener = (err: any) => {
            log.error('Device worker "%s" had an error: %s', device.serial, err.message)
            onError(err)
        }

        const messageListener = (message: string) => {
            if (message !== 'ready') {
                log.warn('Unknown message from device worker "%s": "%s"', device.serial, message)
                return
            }

            onReady()
            proc.removeListener('message', messageListener)
        }

        proc.on('exit', exitListener)
        proc.on('error', errorListener)
        proc.on('message', messageListener)

        return {
            kill: () => {
                // Return used ports to the main pool
                ports.push(...allocatedPorts)
                proc.removeAllListeners('exit')
                proc.removeAllListeners('error')
                proc.removeAllListeners('message')

                log.info('Gracefully killing device worker "%s"', device.serial)
                return procutil.gracefullyKill(proc, options.killTimeout)
            }
        }
    }

    const work = async(device: ADBDevice) => {
        if (!workers[device.serial]) { // when device disconnected - stop restart loop
            return
        }

        log.info('Starting to work for device "%s"', device.serial)
        let resolveReady: () => void

        const ready = new Promise<void>(resolve => (resolveReady = resolve))
        const resolveRegister = () => {
            if (workers[device.serial]?.resolveRegister) {
                workers[device.serial].resolveRegister!()
                delete workers[device.serial]?.resolveRegister
            }
        }

        const handleError = async(err: any) => {
            log.error('Failed start device worker "%s": %s', device.serial, err)
            resolveReady()

            if (err instanceof procutil.ExitError) {
                log.error('Device worker "%s" died with code %s', device.serial, err.code)
                log.info('Restarting device worker "%s"', device.serial)

                await new Promise(r => setTimeout(r, 2000))
                work(device)
            }

            resolveRegister()
        }

        const worker = spawn(device, resolveReady!, handleError)

        await Promise.all([
            workers[device.serial].register.then(() =>
                log.info('Registered device "%s"', device.serial)
            ),
            ready.then(() =>
                log.info('Device "%s" is ready', device.serial)
            )
        ])

        if (!workers[device.serial]) { // when device disconnected - stop restart loop
            return
        }

        // Worker stop
        workers[device.serial].terminate = async() => {
            resolveRegister()
            delete workers[device.serial]

            worker?.kill?.() // if process exited - no effect
            log.info('Cleaning up device worker "%s"', device.serial)

            // Tell others the device is gone
            push.send([
                wireutil.global,
                wireutil.envelope(new wire.DeviceAbsentMessage(device.serial))
            ])

            stats()

            // Wait while DeviceAbsentMessage processed on app side (1s)
            await new Promise(r => setTimeout(r, 1000))
        }

        workers[device.serial].state = 'running'

        stats()

        // Tell others the device state changed
        push.send([
            wireutil.global,
            wireutil.envelope(new wire.DeviceStatusMessage(device.serial, wireutil.toDeviceStatus(device.type)))
        ])
    }

    // Track and manage devices
    const tracker = new ADBObserver({
        intervalMs: 2000,
        port: options.adbPort,
        host: options.adbHost
    })
    log.info('Tracking devices')

    tracker.on('connect', filterDevice((device) => {
        if (workers[device.serial]) {
            log.warn('Device has been connected twice. Skip.')
            return
        }

        log.info('Connected device "%s" [%s]', device.serial, device.type)

        workers[device.serial] = {
            state: 'waiting',
            time: Date.now(),
            terminate: () => {},
            register: register(device) // Register device immediately, before 'running' state
        }

        stats()

        if (device.type === 'device') {
            work(device)
            return
        }

        // Try to reconnect device if it is not available for more than 30 seconds
        if (device.serial.includes(':') && workers[device.serial]) {
            workers[device.serial].waitingTimeoutTimer = setTimeout((serial) => {
                const device = tracker.getDevice(serial)
                if (device && !['device', 'emulator'].includes(device?.type)) {
                    device.reconnect()
                }
            }, 30_000, device.serial)
        }
    }))

    tracker.on('update', filterDevice((device, oldType) => {
        if (!['device', 'emulator'].includes(device.type)) {
            log.info('Lost device "%s" [%s]', device.serial, device.type)
            return stop(device)
        }

        log.info('Device "%s" is now "%s" (was "%s")', device.serial, device.type, oldType)

        // If not running, but can
        if (device.type === 'device' && workers[device.serial]?.state === 'waiting') {
            clearTimeout(workers[device.serial].waitingTimeoutTimer)
            work(device)
        }
    }))

    tracker.on('disconnect', filterDevice(async(device) => {
        log.info('Disconnect device "%s" [%s]', device.serial, device.type)
        clearTimeout(workers[device.serial]?.waitingTimeoutTimer)
        await stop(device)
        delete workers[device.serial]
    }))

    tracker.start()

    let statsTimer: NodeJS.Timeout
    const stats = (twice = true) => {
        const all = Object.keys(workers).length
        const result: any = {
            waiting: [],
            running: []
        }
        for (const serial of Object.keys(workers)) {
            if (workers[serial].state === 'running') {
                result.running.push(serial)
                continue
            }
            result.waiting.push(serial)
        }

        log.info(`Providing ${result.running.length} of ${all} device(s); waiting for [${result.waiting.join(', ')}]`)
        log.info(`Providing all ${all} of ${tracker.count} device(s)`)
        log.info(`Providing all ${tracker.count} device(s)`)

        if (twice) {
            clearTimeout(statsTimer)
            statsTimer = setTimeout(stats, 10000, false)
        }
    }

    lifecycle.observe(async() => {
        await Promise.all(
            Object.values(workers)
                .map(worker =>
                    worker.terminate()
                )
        )

        stats(false)
        tracker.destroy()

        ;[push, sub].forEach((sock) =>
            sock.close()
        )
    })
})
