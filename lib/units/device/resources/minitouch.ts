import util from 'util'
import fs from 'fs'
import syrup from '@devicefarmer/stf-syrup'
import type {Client} from '@u4/adbkit'
import logger from '../../../util/logger.js'
import {requiredMatch, module} from '../../../util/pathutil.js'
import devutil from '../../../util/devutil.js'
import Resource from './util/resource.js'
import adb from '../support/adb.js'
import abi from '../support/abi.js'
import lifecycle from '../../../util/lifecycle.js'

interface MinitouchOptions {
    serial: string
}

interface MinitouchResource {
    bin: Resource
}

interface MinitouchResult {
    bin: string
    run: (cmd?: string) => Promise<NodeJS.ReadableStream>
}

export default syrup.serial()
    .dependency(adb)
    .dependency(abi)
    .dependency(devutil)
    .define(async (options: MinitouchOptions, adb: Client, abi: any, devutil: any): Promise<MinitouchResult> => {
        const log = logger.createLogger('device:resources:minitouch')
        const resources: MinitouchResource = {
            bin: new Resource({
                src: requiredMatch(abi.all.map((supportedAbi: string) =>
                    module(util.format('@devicefarmer/minitouch-prebuilt/prebuilt/%s/bin/minitouch%s', supportedAbi, abi.pie ? '' : '-nopie'))
                )),
                dest: [
                    '/data/local/tmp/minitouch',
                    '/data/data/com.android.shell/minitouch'
                ],
                comm: 'minitouch',
                mode: 0o755
            })
        }

        const removeResource = async (res: Resource) => {
            await adb.getDevice(options.serial).execOut(['rm', '-f', res.dest])
        }

        const pushResource = async (res: Resource) => {
            const transfer = await adb.getDevice(options.serial).push(res.src, res.dest, res.mode)
            await transfer.waitForEnd()
        }

        const checkExecutable = async (res: Resource) => {
            try {
                const stats = await adb.getDevice(options.serial).stat(res.dest)
                return (stats.mode & fs.constants.S_IXUSR) === fs.constants.S_IXUSR
            } catch (err: any) {
                return false
            }
        }

        const installResource = async (res: Resource): Promise<void> => {
            if (await checkExecutable(res)) return;

            log.info('Installing "%s" as "%s"', res.src, res.dest)

            await removeResource(res)
            await pushResource(res)
            const ok = await checkExecutable(res)

            if (!ok) {
                log.error('Pushed "%s" not executable, attempting fallback location', res.comm)
                res.shift()
                return installResource(res)
            }
        }

        const plugin = {
            bin: resources.bin.dest,
            run: (cmd?: string) =>
                adb.getDevice(options.serial).shell(`exec ${resources.bin.dest} ${cmd || ''}`),

            stop: async () => {
                const pid = (await adb.getDevice(options.serial).execOut('pidof minitouch')).toString().trim()
                if (!pid?.length) return;

                log.info('Stopping minitouch process %s', pid)
                return adb.getDevice(options.serial).execOut(['kill', '-9', pid])
            }
        }

        lifecycle.observe(() => plugin.stop())

        await plugin.stop()
        await installResource(resources.bin)

        return plugin
    })
