import syrup from '@devicefarmer/stf-syrup'
import type {Client} from '@u4/adbkit'
import type {Duplex} from 'node:stream'
import logger from '../../../util/logger.js'
import {vendor} from '../../../util/pathutil.js'
import adb from '../support/adb.js'

/**
 * The device side of `adb reverse` for remote connect: a dex jar run by
 * app_process as the shell user (source and build: vendor/devicehub-reverse,
 * scripts/build-reverse-helper.ts). Started on demand by the connect plugin.
 */

const JAR = vendor('devicehub-reverse/devicehub-reverse.jar')
const DEST = '/data/local/tmp/devicehub-reverse.jar'
const MAIN = 'devicehub.reverse.Helper'
/** What the helper prints once its socket is up; the number is its protocol */
const READY = 'ready 1'
const START_TIMEOUT_MS = 15_000

export interface ReverseHelperResource {
    /**
     * Start the helper. Resolves with its `adb shell` stream once it serves its
     * socket; the helper exits when that stream ends, and its end means the
     * helper is gone. A previous instance is asked to leave by the new one.
     */
    start(): Promise<Duplex>
}

export default syrup.serial()
    .dependency(adb)
    .define((options: {serial: string}, adb: Client): ReverseHelperResource => {
        const log = logger.createLogger('device:resources:reverse')
        let installed: Promise<void> | null = null

        // Once per worker: the jar is small, and a stale one from an older
        // DeviceHub must not survive a deploy
        const install = () => {
            installed ??= (async() => {
                log.info('Installing "%s" as "%s"', JAR, DEST)
                const transfer = await adb.getDevice(options.serial).push(JAR, DEST, 0o644)
                await transfer.waitForEnd()
            })().catch(err => {
                installed = null
                throw err
            })
            return installed
        }

        const start = async(): Promise<Duplex> => {
            await install()
            // --nice-name: shows as devicehub-reverse in ps rather than app_process
            const out = await adb.getDevice(options.serial).shell(
                `CLASSPATH=${DEST} exec app_process /system/bin --nice-name=devicehub-reverse ${MAIN}`
            ) as Duplex
            // Never removed: adbkit re-emits a socket error with no listener of
            // ours on the shared adb client, which nobody listens to — a crash
            out.on('error', () => {})

            await new Promise<void>((resolve, reject) => {
                let output = ''
                let ready = false
                const fail = (reason: string) => {
                    clearTimeout(timer)
                    out.destroy()
                    reject(new Error(`Reverse helper did not start (${reason}): ${output.trim()}`))
                }
                const timer = setTimeout(() => fail('timeout'), START_TIMEOUT_MS)
                out.on('data', (chunk: Buffer) => {
                    if (ready) {
                        // Only an exception stack ever comes this way
                        log.warn('Reverse helper says: %s', chunk.toString().trim())
                        return
                    }
                    output += chunk.toString()
                    if (output.split('\n').some(line => line.trim() === READY)) {
                        ready = true
                        clearTimeout(timer)
                        resolve()
                    }
                })
                out.on('end', () => {
                    if (!ready) {
                        fail('exited')
                    }
                })
            })
            return out
        }

        return {start}
    })
