import util from 'util'
import fs from 'fs'
import Promise from 'bluebird'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import * as pathutil from '../../../util/pathutil.cjs'
import devutil from '../../../util/devutil.js'
import * as streamutil from '../../../util/streamutil.js'
import Resource from './util/resource.js'
import adb from '../support/adb.js'
import abi from '../support/abi.js'
export default syrup.serial()
    .dependency(adb)
    .dependency(abi)
    .dependency(devutil)
    .define(function(options, adb, abi, devutil) {
        var log = logger.createLogger('device:resources:minitouch')
        var resources = {
            bin: new Resource({
                src: pathutil.requiredMatch(abi.all.map(function(supportedAbi) {
                    return pathutil.module(util.format('@devicefarmer/minitouch-prebuilt/prebuilt/%s/bin/minitouch%s', supportedAbi, abi.pie ? '' : '-nopie'))
                })),
                dest: [
                    '/data/local/tmp/minitouch',
                    '/data/data/com.android.shell/minitouch'
                ],
                comm: 'minitouch',
                mode: 0o755
            })
        }
        async function removeResource(res) {
            const out = await adb.getDevice(options.serial).shell(['rm', '-f', res.dest])
            await streamutil.readAll(out)
            return res
        }
        async function pushResource(res) {
            const transfer = await adb.getDevice(options.serial).push(res.src, res.dest, res.mode)
            await transfer.waitForEnd()
            return res
        }
        async function installResource(res) {
            log.info('Installing "%s" as "%s"', res.src, res.dest)
            async function checkExecutable(res) {
                const stats = await adb.getDevice(options.serial).stat(res.dest)
                return (stats.mode & fs.constants.S_IXUSR) === fs.constants.S_IXUSR
            }
            const removeResult = await removeResource(res)
            const res2 = await pushResource(removeResult)
            const ok = await checkExecutable(res2)
            if (!ok) {
                log.info('Pushed "%s" not executable, attempting fallback location', res.comm)
                res.shift()
                return installResource(res)
            }
            return res
        }
        function installAll() {
            return Promise.all([
                installResource(resources.bin)
            ])
        }
        function stop() {
            return devutil.killProcsByComm(resources.bin.comm, resources.bin.dest)
        }
        return stop()
            .then(installAll)
            .then(function() {
                return {
                    bin: resources.bin.dest,
                    run: function(cmd) {
                        return adb.getDevice(options.serial).shell(util.format('exec %s%s', resources.bin.dest, cmd ? util.format(' %s', cmd) : ''))
                    }
                }
            })
    })
