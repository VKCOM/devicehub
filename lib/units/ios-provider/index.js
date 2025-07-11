import _ from 'lodash'
import logger from '../../util/logger.js'
import lifecycle from '../../util/lifecycle.js'
import * as usbmux from '@irdk/usbmux'
import {openPort} from './redirect-ports.js'
import {WDA} from './wda.js'
import {Esp32Touch} from '../ios-device/plugins/touch/esp32touch.js'
import IOSSimObserver from './IOSSimObserver.js'

/**
 * @typedef {object} IOSDevice
 * @property {string} SerialNumber
 * @property {string} USBSerialNumber
 *
 */

/**
 * @typedef {object} Options
 * @property {string} name
 * @property {string} wdaPath
 * @property {number[]} wdaPorts
 * @property {number[]} screenListenPorts
 * @property {number[]} screenWsPorts
 * @property {string} usbmuxPath
 * @property {(serial: string) => boolean} filter
 * @property {(serial: string, opts: { wdaPort: number, screenPort: number, screenListenPort: number, esp32Path: string? }) => import('child_process').ChildProcess} fork
 */

/**
 * Start a provider instance.
 * For each device ios provider opens a port for a wda connection and for the screen websocket. Those limits are defined with wdaPorts and screenWsPorts.
 * @param {Options} options Options for the provider
 * @returns {Promise<void>} nothing
 */
export default async function(options) {
    const log = logger.createLogger('ios-provider')
    const wda = new WDA(options.wdaPath)
    await wda.prepareWda()

    /** @type { Object.<string, () => void > } */
    const workers = {}

    const lists = {
        all: [],
        ready: [],
        waiting: []
    }

    /** @type { import('@serialport/bindings-interface').PortInfo[]} */
    let usedEsp32 = []

    /**
     * @type {import('@serialport/bindings-interface').PortInfo[]}
     */
    let curEsp32 = [];

    (() => {
        setInterval(async() => {
            // Listen for iMouseDevices.
            const newDevices = await Esp32Touch.listPorts()
            const diffAdd = _.differenceBy(newDevices, curEsp32, 'path')
            const diffRemove = _.differenceBy(curEsp32, newDevices, 'path')
            diffAdd.forEach((dev) => {
                log.info(`Added ESP32 to the pool. path=${dev.path}, productId=${dev.productId}, manufacturer=${dev.manufacturer}`)
            })
            diffRemove.forEach((dev) => {
                log.info(`Removed ESP32 from the pool. path=${dev.path}, productId=${dev.productId}, manufacturer=${dev.manufacturer}`)
            })
            curEsp32 = newDevices
        }, 1000)
    })()

    /** @type { NodeJS.Timeout }*/
    let totalsTimer
    const delayedTotals = (function() {
        function totals() {
            if (lists.waiting.length) {
                log.info('Providing %d of %d device(s); waiting for "%s"', lists.ready.length, lists.all.length, lists.waiting.join('", "'))
                delayedTotals()
            }
            else if (lists.ready.length < lists.all.length) {
                log.info('Providing all %d of %d device(s); ignoring not ready: "%s"', lists.ready.length, lists.all.length, _.difference(lists.all, lists.ready).join('", "'))
            }
            else {
                log.info('Providing all %d device(s)', lists.all.length)
            }
        }
        return function() {
            clearTimeout(totalsTimer)
            totalsTimer = setTimeout(totals, 10000)
        }
    })()

    /**
     * Start worker for device
     *
     * @param {string} udid Device udid
     * @returns {Promise<void>}
     */
    const startWorker = async(udid, simulator = false) => {
        log.info(`Starting worker for ${udid} [${simulator ? 'simulator' : 'device'}]`)
        const [wdaPort, screenPort] = [options.wdaPorts.shift(), options.screenWsPorts.shift()]
        const screenListenPort = options.screenListenPorts.shift()
        if (!wdaPort || !screenPort || !screenListenPort) {
            log.debug(options)
            throw Error('Port pool is depleted. Cannot start device worker.')
        }

        let wdaStopForwarding, screenStopForwarding
        if (!simulator) {
            log.info(`Starting port forwarding for device ${udid}`)

            ;[wdaStopForwarding, screenStopForwarding] = await Promise.all([
                openPort(8100, wdaPort, udid, options.usbmuxPath),
                openPort(9100, screenPort, udid, options.usbmuxPath)
            ])
        }

        // @ts-ignore
        await wda.startWda(udid, ...(simulator ? [wdaPort, screenPort] : []))

        const esp32ToUse = _.sample(_.differenceBy(curEsp32, usedEsp32, 'path'))
        if (esp32ToUse) {
            usedEsp32.push(esp32ToUse)
            log.info(`Using ${esp32ToUse.path} ESP32`)
        }

        const proc = options.fork(udid, {
            wdaPort, screenPort, screenListenPort, esp32Path: esp32ToUse?.path ?? null
        })

        /** @type {(value: any) => void} */
        let cleanupResolve
        let cleanupPromise = new Promise((resolve, reject) => {
            cleanupResolve = resolve
        })

        let shouldRun = true

        const cleanup = async() => {
            log.info(`Cleaning up worker after ${udid}`)
            if (esp32ToUse) {
                log.info(`Returning ${esp32ToUse.path} to the pool`)
                usedEsp32.splice(usedEsp32.findIndex((dev) => dev.path === esp32ToUse.path), 1)
            }
            await wda.cleanup(udid)
            log.debug('Stopped WDA')

            if (!simulator) {
                await wdaStopForwarding()
                log.debug('Stopped wda forwarder')
                await screenStopForwarding()
                log.debug('Stopped screen forwarder')
            }

            options.wdaPorts.push(wdaPort)
            options.screenWsPorts.push(screenPort)
            options.screenListenPorts.push(screenListenPort)
            delete workers[udid]
            log.info(`Cleaned up worker after ${udid}`)
            cleanupResolve('done')
            if (shouldRun) {
                log.info('And restarting...')
                try {
                    await startWorker(udid)
                }
                catch (e) {
                    log.error('Could not restart worker...')
                }
            }
        }

        proc.on('exit', cleanup)

        workers[udid] = async function endWorker() {
            log.info(`Killing worker for ${udid}`)
            await new Promise((resolve, _) => proc.on('exit', resolve))
            shouldRun = false
            proc.kill(9)
            await cleanupPromise
            log.info(`Killed worker for ${udid}`)
        }
    }

    const onAttach = async(udid, simulator) => {
        try {
            log.info(`Attached ${simulator ? 'simulator' : 'device'} ${udid}. Sleeping two seconds, then starting`)
            await new Promise((r) => setTimeout(r, 2000))

            await startWorker(udid, simulator)
        }
        catch (e) {
            log.error(`Could not spawn worker for ${udid}`, e)
        }
    }

    const onDetach = (udid) => {
        log.info(`Detached device ${udid}`)
        const stopFunction = workers[udid]
        if (stopFunction) {
            stopFunction()
        }
        else {
            log.warn(`No stop function for device ${udid}. Worker was unable to start?`)
        }
    }

    const simObserver = new IOSSimObserver()
    simObserver.on('attached', udid => onAttach(udid, true))
    simObserver.on('detached', onDetach)

    simObserver.listen()

    const usbObserver = usbmux.createListener()
    usbObserver.on('attached', onAttach)
    usbObserver.on('detached', onDetach)

    log.info('Listening for devices')

    lifecycle.observe(function() {
        clearTimeout(totalsTimer)
        return Promise.all(Object.keys(workers).map(function(serial) {
            return workers[serial]()
        }))
    })
}
