import {resolve} from 'path'
import logger from '../../util/logger.js'
import childProcess from 'child_process'
import {readAll} from '../../util/streamutil.js'
import assert from 'assert'
import util from 'util'
import EventEmitter from 'events'


const log = logger.createLogger('wda')

class Mutex {
    mtx = Promise.resolve()

    /**
     *
     * @returns {Promise<function (): void>} unlock
     */
    async lock() {
        await this.mtx
        let unlock = null
        this.mtx = new Promise(resolve => {
            unlock = resolve
        })
        return unlock
    }
}

const mutex = new Mutex()


/**
 * @property {string} wdaPath
 */
export class WDA {
    // wtf

    /**
     * @param {string | null} path wda path
     */
    constructor(path) {
        if (path) {
            this.wdaPath = path
        }
        else {
            this.wdaPath = resolve(import.meta.dirname, '../../../WebDriverAgent')
        }
    }

    async prepareWda() {
        const buildProc = childProcess.spawn('xcodebuild -project WebDriverAgent.xcodeproj -scheme WebDriverAgentRunner -destination generic/platform=iOS -allowProvisioningUpdates build', {cwd: this.wdaPath, shell: true, timeout: 10 * 60 * 1000, stdio: 'inherit'})
        assert(buildProc)
        await EventEmitter.once(buildProc, 'exit')
        if (buildProc.exitCode !== 0) {
            throw Error(`Could not build wda. Exit code is ${buildProc.exitCode}`)
        }
    }

    /**
     *
     * @param {string} udid device udid
     * @returns {Promise<function (): void>} stopper function
     */
    async startWda(udid) {
        const unlock = await mutex.lock()
        log.info(`Using wda path ${this.wdaPath}`)
        log.info('Building')

        /**
         * @type {childProcess.ChildProcess | null}
         */
        let testProc = null
        const cleanup = async() => {
            const killProc = async(/** @type {childProcess.ChildProcess | null} */ proc) => {
                if (proc !== null) {
                    proc.kill(9)
                    if (proc.exitCode === null) {
                        await EventEmitter.once(proc, 'exit')
                    }
                }
            }
            await killProc(testProc)
            await unlock()
        }
        try {
            testProc = childProcess.spawn(`xcodebuild -project WebDriverAgent.xcodeproj -scheme WebDriverAgentRunner -destination "id=${udid}" -allowProvisioningUpdates test`, {cwd: this.wdaPath, shell: true, stdio: 'pipe'})
            await new Promise((resolve, reject) => {
                assert(testProc)
                assert(testProc.stdout)
                assert(testProc.stderr)
                testProc.on('exit', reject)
                testProc?.stdout?.on('data', (chunk) => {
                    const findRes = /ServerURLHere->(.*)<-ServerURLHere/g.exec(chunk)
                    if (findRes) {
                        resolve(findRes[0])
                    }
                })
                testProc?.stdout.pipe(process.stdout)
                testProc?.stderr?.pipe(process.stderr)
            })
            await unlock()
        }
        catch (e) {
            cleanup()
            throw e
        }
        return cleanup
    }
}

