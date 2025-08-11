import {resolve} from 'path'
import logger from '../../../../util/logger.js'
import childProcess from 'child_process'
import assert from 'assert'
import EventEmitter from 'events'
import lockfile from 'proper-lockfile'
import {tmpdir} from 'os'
import {writeFileSync, existsSync} from 'fs'
import {mkdir} from 'fs/promises'

const log = logger.createLogger('wda')
const lockFilePath = resolve(tmpdir(), 'wda')
writeFileSync(lockFilePath, '')

const waitNLock = async(attempt = 0) => {
    try {
        return await lockfile.lock(lockFilePath, {
            stale: 10 * 60 * 1000, // 10 min
            update: 1500 // per 1.5 sec
        })
    }
    catch (/** @type {any} */ e) { // if locked - try again later
        if (e.code !== 'ELOCKED' || ++attempt >= 720) { // max 720 attempts - 30 min
            throw e
        }
        await new Promise(r => setTimeout(r, 2500)) // retry per 2.5 sec
        return waitNLock()
    }
}

export default class WDAService {

    /**
     * @param {string | null} path wda path
     */
    constructor(path) {
        if (path) {
            this.wdaPath = path
        }
        else {
            this.wdaPath = resolve(import.meta.dirname, '../../../../../WebDriverAgent')
        }

        /**
         * @type {Object.<string, childProcess.ChildProcess>} amogus
         */
        this.testProcs = {}
    }

    async prepare(udid, isSimulator) {
        log.info(`Using wda path ${this.wdaPath}`)
        const buildPath = resolve(
            this.wdaPath,
            `wda_build/Build/Products/${isSimulator ? 'Debug-iphonesimulator' : 'Debug-iphoneos'}`
        )
        if (existsSync(buildPath)) {
            return
        }
        await mkdir(buildPath, {recursive: true})
        log.info('Building')

        const command =
            'xcodebuild -project WebDriverAgent.xcodeproj ' +
              '-scheme WebDriverAgentRunner ' +
              `-destination "id=${udid}" ` +
              '-allowProvisioningUpdates ' +
              '-derivedDataPath ./wda_build ' +
              'build-for-testing'

        const buildProc = childProcess.spawn(command, {cwd: this.wdaPath, shell: true, timeout: 10 * 60 * 1000, stdio: 'inherit'})

        assert(buildProc)
        await EventEmitter.once(buildProc, 'exit')
        if (buildProc.exitCode !== 0) {
            throw Error(`Could not build wda. Exit code is ${buildProc.exitCode}`)
        }
    }

    /**
     *
     * @param {string} udid device udid
     * @param {number=} port
     * @param {number=} screenPort
     * @returns {Promise<void>} nothing
     */
    async start(udid, isSimulator, port, screenPort) {
        await this.cleanup(udid)

        const unlock = await waitNLock()
        try {
            await this.prepare(udid, isSimulator)
            const portArg = port ? ` USE_PORT=${port}` : ''
            const screenPortArg = screenPort ? ` MJPEG_SERVER_PORT=${screenPort}` : ''
            const command =
                'xcodebuild -project WebDriverAgent.xcodeproj ' +
                  '-scheme WebDriverAgentRunner ' +
                  `-destination "id=${udid}" ` +
                  '-allowProvisioningUpdates ' +
                  '-derivedDataPath ./wda_build ' +
                  'test-without-building' +
                   portArg + screenPortArg

            const testproc = childProcess.spawn(command, {cwd: this.wdaPath, shell: true, stdio: 'pipe'})
            this.testProcs[udid] = testproc
            await new Promise((resolve, reject) => { // Wait for server init
                assert(testproc)
                testproc.on('exit', reject)
                testproc?.stdout?.on('data', (chunk) => {
                    const findRes = /ServerURLHere->(.*)<-ServerURLHere/g.exec(chunk)
                    if (findRes) {
                        assert(testproc)
                        testproc.removeListener('exit', reject)
                        resolve(findRes[0])
                    }
                })
                testproc?.stdout?.pipe(process.stdout)
                testproc?.stderr?.pipe(process.stderr)
            })
            testproc.on('exit', async() => {
                await this.cleanup(udid)
                log.error(`WDA process for ${udid} exited`)
            })
        }
        catch (e) {
            await this.cleanup(udid)
            throw e
        }
        finally {
            await unlock()
        }

    }

    /**
     * @param {string} udid device udid
     * @returns {Promise<void>} nothing
     */
    async cleanup(udid) {
        log.debug('Stopped WDA')
        if (!this.testProcs[udid]) {
            return
        }

        const proc = this.testProcs[udid]
        delete this.testProcs[udid]
        proc.kill(9)
        if (proc.exitCode === null) {
            await EventEmitter.once(proc, 'exit')
        }
    }
}

