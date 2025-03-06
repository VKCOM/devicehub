import _ from 'lodash'
import logger from '../../util/logger.js'
import lifecycle from '../../util/lifecycle.js'
import * as usbmux from '@irdk/usbmux'
import {openPort} from './redirect-ports.js'
import {WDA} from './wda.js'

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
 * @property {(serial: string) => boolean} filter
 * @property {(serial: string, opts: {wdaPort: number, screenPort: number, screenListenPort: number}) => import('child_process').ChildProcess} fork
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
        all: []
        , ready: []
        , waiting: []
    }

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
     * @returns {Promise<function(): Promise<void>>} stopper function
     */
    const startWorker = async(udid) => {
        log.info(`Starting worker for ${udid}`)
        const [wdaPort, screenPort] = [options.wdaPorts.shift(), options.screenWsPorts.shift()]
        const screenListenPort = options.screenListenPorts.shift()
        if (!wdaPort || !screenPort || !screenListenPort) {
            log.debug(options)
            throw Error('Port pool is depleted. Cannot start device worker.')
        }

        const [wdaStopForwarding, screenStopForwarding] = await Promise.all([openPort(8100, wdaPort, udid), openPort(9100, screenPort, udid)])

        const stopWda = await wda.startWda(udid)

        const proc = options.fork(udid, {
            wdaPort, screenPort, screenListenPort
        })

        /** @type {(value: any) => void} */
        let cleanupResolve
        let cleanupPromise = new Promise((resolve,) => {
            cleanupResolve = resolve
        })

        const cleanup = async() => {
            log.info(`Cleaning up worker after ${udid}`)
            await stopWda()
            await wdaStopForwarding()
            await screenStopForwarding()
            options.wdaPorts.push(wdaPort)
            options.screenWsPorts.push(screenPort)
            options.screenListenPorts.push(screenListenPort)
            delete workers[udid]
            log.info(`Cleaned up worker after ${udid}`)
            cleanupResolve(null)
        }

        proc.on('exit', cleanup)

        return async function endWorker() {
            log.info(`Killing worker for ${udid}`)
            await new Promise((resolve, _) => proc.on('exit', resolve))
            proc.kill(9)
            await cleanupPromise
            log.info(`Killed worker for ${udid}`)
        }
    }

    const listener = usbmux.createListener()
    listener.on('attached', async(device) => {
        log.info(`Attached device ${device}`)
        try {
            workers[device] = await startWorker(device)
        }
        catch (e) {
            log.error(`Could not spawn worker for ${device}`, e)
        }
    })
    listener.on('detached', (device) => {
        log.info(`Detached device ${device}`)
        const stopFunction = workers[device]
        if (stopFunction) {
            stopFunction()
        }
        else {
            log.warn(`No stop function for device ${device}. Worker was unable to start?`)
        }
    })

    log.info('Listening for devices')

    lifecycle.observe(function() {
        clearTimeout(totalsTimer)
        return Promise.all(Object.keys(workers).map(function(serial) {
            return workers[serial]()
        }))
    })
}
