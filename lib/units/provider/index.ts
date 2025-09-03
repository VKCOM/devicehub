import {Adb, Device as AdbDevice} from '@u4/adbkit'
import _ from 'lodash'
import EventEmitter from 'eventemitter3'
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

const debounce = (fn: (...args: any) => Promise<any> | any, wait: number) => {
    let timeout: NodeJS.Timeout
    return (...args: any[]) => {
        clearTimeout(timeout)
        timeout = setTimeout(fn, wait, ...args)
    }
}

type Device = AdbDevice & { present: boolean }

export interface Options {
    adbHost: string
    adbPort: number
    ports: number[]
    endpoints: {
        push: string[]
        sub: string[]
    }
    allowRemote: boolean
    filter: (device: Device) => boolean
    deviceType: string
    name: string
    fork: (device: Device, ports: number[]) => ChildProcess
    killTimeout: number
}

export default (async function(options: Options) {
    const log = logger.createLogger('provider')
    await db.connect()

    // Check whether the ipv4 address contains a port indication
    if (options.adbHost.includes(':')) {
        log.error('Please specify adbHost without port')
        lifecycle.fatal()
    }

    const client = Adb.createClient({
        host: options.adbHost,
        port: options.adbPort
    })

    const workers: Record<string, () => Promise<void>> = {}
    const solo = wireutil.makePrivateChannel()
    const lists = {
        all: new Set(),
        ready: new Set(),
        waiting: new Set()
    }
    let totalsTimer: NodeJS.Timeout

    // To make sure that we always bind the same type of service to the same
    // port, we must ensure that we allocate ports in fixed groups.
    let ports = options.ports.slice(0, options.ports.length - options.ports.length % 4)

    // Information about total devices
    const totals = () => {
        if (lists.waiting.size) {
            log.info('Providing %d of %d device(s); waiting for "%s"', lists.ready.size, lists.all.size, Array.from(lists.waiting).join('", "'))
            delayedTotals()
        }
        else if (lists.ready.size < lists.all.size) {
            log.info('Providing all %d of %d device(s); ignoring not ready: "%s"', lists.ready.size, lists.all.size, _.difference(Array.from(lists.all), Array.from(lists.ready)).join('", "'))
        }
        else {
            log.info('Providing all %d device(s)', lists.all.size)
        }
    }

    const delayedTotals = () => {
        clearTimeout(totalsTimer)
        totalsTimer = setTimeout(totals, 10000)
    }

    // Output
    const push = zmqutil.socket('push')
    try {
        await Promise.all(options.endpoints.push.map(async(endpoint) => {
            const records = await srv.resolve(endpoint)
            return await srv.attempt(records, (record) => {
                log.info('Sending output to "%s"', record.url)
                push.connect(record.url)
                return Promise.resolve(true)
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
            return await srv.attempt(records, (record) => {
                log.info('Receiving input to "%s"', record.url)
                sub.connect(record.url)
                return Promise.resolve(true)
            })
        }))
    }
    catch (err) {
        log.fatal('Unable to connect to sub endpoint', err)
        lifecycle.fatal()
    }


    ;[solo].forEach(function(channel) {
        log.info('Subscribing to permanent channel "%s"', channel)
        sub.subscribe(channel)
    })

    // This can happen when ADB doesn't have a good connection to
    // the device
    const isWeirdUnusableDevice = (device: Device) =>
        device.id === '????????????'

    // Check whether the device is remote (i.e. if we're connecting to
    // an IP address (or hostname) and port pair).
    const isRemoteDevice = (device: Device) =>
        device.id.includes(':')

    // Helper for ignoring unwanted devices
    const filterDevice = (listener: (device: Device) => any | Promise<any>) =>
        ((device: Device) => {
            if (isWeirdUnusableDevice(device)) {
                log.warn('ADB lists a weird device: "%s"', device.id)
                return false
            }
            if (!options.allowRemote && isRemoteDevice(device)) {
                log.info('Filtered out remote device "%s", use --allow-remote to override', device.id)
                return false
            }
            if (options.filter && !options.filter(device)) {
                log.info('Filtered out device "%s"', device.id)
                return false
            }
            return listener(device)
        }) as (device: AdbDevice) => any | Promise<any>

    // Track and manage devices
    const tracker = await client.trackDevices()

    log.info('Tracking devices')

    // To make things easier, we're going to cheat a little, and make all
    // device events go to their own EventEmitters. This way we can keep all
    // device data in the same scope.
    const flippedTracker = new EventEmitter()
    tracker.on('add', filterDevice(async(device) => {
        log.info('Found device "%s" (%s)', device.id, device.type)

        if (workers[device.id]) {
            log.info('Device "%s" is already exists, reboot process', device.id)
            log.info('Shutting down device worker "%s"', device.id)
            await workers[device.id]()
        }

        const privateTracker = new EventEmitter()
        let willStop = false
        let timer

        // Check if we can do anything with the device
        const check = async() => {
            log.info(`Checking ${device.id}`)
            clearTimeout(timer)

            if (device.present && ['device', 'emulator'].includes(device?.type)) {
                log.info(`Checking ${device.id} successfully`)
                return true
            }

            log.info(`Checking ${device.id} failed [deviceType: ${device?.type}]`)
            return false
        }

        // Wait for others to acknowledge the device
        const register = new Promise<void>(async(resolve) =>{
            privateTracker.on('remove', () => {
                resolve()
            })

            log.info('Registering device')

            // Tell others we found a device
            push.send([
                wireutil.global,
                wireutil.envelope(new wire.DeviceIntroductionMessage(device.id, wireutil.toDeviceStatus(device.type), new wire.ProviderMessage(solo, options.name)))
            ])

            dbapi.setDeviceType(device.id, options.deviceType)

            privateTracker.once('register', () => {
                privateTracker.once('ready', () => {
                    resolve()
                })
            })
        })

        // Spawn a device worker
        const spawn = () => {
            let allocatedPorts = ports.splice(0, 4)
            lists.waiting.add(device.id)

            let didExit = false
            const proc = options.fork(device, allocatedPorts)

            log.info('Spawned a device worker')

            const exitListener = (code: number, signal: string) => {
                didExit = true
                if (signal) {
                    log.warn('Device worker "%s" was killed with signal %s, assuming ' +
                        'deliberate action and not restarting', device.id, signal)

                    lists.waiting.delete(device.id)
                    workers[device.id]?.()
                }
                else if (code === 0) {
                    log.info('Device worker "%s" stopped cleanly', device.id)
                }
                else {
                    throw new procutil.ExitError(code)
                }
            }

            const errorListener = (err: any) => {
                log.error('Device worker "%s" had an error: %s', device.id, err.message)
            }

            const messageListener = (message: string) => {
                if (message !== 'ready') {
                    log.warn('Unknown message from device worker "%s": "%s"', device.id, message)
                    return
                }

                log.info('Device "%s" is ready', device.id)

                lists.waiting.delete(device.id)
                lists.ready.add(device.id)

                privateTracker.emit('ready')
            }

            proc.on('exit', exitListener)
            proc.on('error', errorListener)
            proc.on('message', messageListener)

            return {
                cancel: () => {
                    // Return used ports to the main pool
                    ports.push(...allocatedPorts)

                    if (!didExit) { // Prevents when the process is already dead
                        log.info('Gracefully killing device worker "%s"', device.id)
                        return procutil.gracefullyKill(proc, options.killTimeout)
                    }
                }
            }
        }

        // Starts a device worker and keeps it alive
        const work = async() => {
            log.info('Starting to work for device "%s"', device.id)
            try {
                const worker = spawn()

                // Worker stop
                workers[device.id] = async() => {
                    worker?.cancel() // if process exited - no effect
                    log.info('Cleaning up device worker "%s"', device.id)

                    // Update lists
                    lists.all.delete(device.id)
                    lists.ready.delete(device.id)
                    lists.waiting.delete(device.id)

                    delayedTotals()

                    // Tell others the device is gone
                    push.send([
                        wireutil.global,
                        wireutil.envelope(new wire.DeviceAbsentMessage(device.id))
                    ])

                    // Wait while DeviceAbsentMessage processed on app side (1s)
                    await new Promise(r => setTimeout(r, 1000))
                    delete workers[device.id]
                }

                await register
                log.info('Registered device "%s"', device.id)

                // Statistics
                delayedTotals()
            }
            catch (err: any) {
                log.error('Failed start device worker "%s": %s', device.id, err)
                if (err instanceof procutil.ExitError && !willStop) {
                    log.error('Device worker "%s" died with code %s', device.id, err.code)
                    log.info('Restarting device worker "%s"', device.id)
                    await new Promise(r => setTimeout(r, 500))
                    return work()
                }
            }
        }

        const stop = () => {
            log.info('Shutting down device worker "%s"', device.id) // log required
            return workers[device.id]?.() // if running
        }

        // When any event occurs on the added device
        const deviceListener = (type: string, ...args: any[]) => {
            log.info(`deviceListener ${type} ${JSON.stringify(args)}`)
            // Okay, this is a bit unnecessary, but it allows us to get rid of an
            // ugly switch statement and return to the original style.
            privateTracker.emit(type, ...args)
        }

        // When the added device changes
        const changeListener = async(updatedDevice: AdbDevice) => {
            log.info('Device "%s" is now "%s" (was "%s")', device.id, updatedDevice.type, device.type)
            device.type = updatedDevice.type

            // Tell others the device changed
            push.send([
                wireutil.global,
                wireutil.envelope(new wire.DeviceStatusMessage(device.id, wireutil.toDeviceStatus(device.type)))
            ])

            // If not running, but can
            if (!lists.waiting.has(device.id) && !workers[device.id] && await check()) {
                await work()
            }
        }

        // When the added device gets removed
        const removeListener = async() => {
            log.info('Lost device "%s" (%s)', device.id, device.type)
            clearTimeout(timer)

            flippedTracker.removeListener(device.id, deviceListener)

            device.present = false
            willStop = true
            await stop()
        }


        flippedTracker.on(device.id, (type: string, ...args: any[]) =>
            deviceListener(type, ...args)
        )
        privateTracker.on('change', changeListener)
        privateTracker.on('remove', removeListener)

        // Will be set to false when the device is removed
        device.present = true

        // If work has not started, will start it later.
        if (await check()) {
            await work()
        }
    }))

    tracker.on('change', debounce(filterDevice((device) =>
        flippedTracker.emit(device.id, 'change', device)
    ), 400))

    tracker.on('remove', filterDevice((device) => {
        flippedTracker.emit(device.id, 'remove', device)
    }))

    sub.on('message', new WireRouter()
        .on(wire.DeviceRegisteredMessage, (channel, message) => {
            flippedTracker.emit(message.serial, 'register')
        })
        .handler()
    )

    lifecycle.share('Tracker', tracker)

    lifecycle.observe(async() => {
        await Promise.all(Object.keys(workers).map(serial => workers[serial]()))
        clearTimeout(totalsTimer)
        ;[push, sub].forEach((sock) => {
            try {
                sock.close()
            }
            catch (err) {
                // No-op
            }
        })
    })
})
