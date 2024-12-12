import fs from 'fs'
import util from 'util'
import Promise from 'bluebird'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import * as pathutil from '../../../util/pathutil.cjs'
import devutil from '../../../util/devutil.js'
import * as streamutil from '../../../util/streamutil.js'
import Resource from './util/resource.js'
import adb from '../support/adb.js'
import properties from '../support/properties.js'
import abi from '../support/abi.js'
export default syrup.serial()
    .dependency(adb)
    .dependency(properties)
    .dependency(abi)
    .define(function(options, adb, properties, abi) {
        var log = logger.createLogger('device:resources:minirev')
        var resources = {
            bin: new Resource({
                src: pathutil.requiredMatch(abi.all.map(function(supportedAbi) {
                    return pathutil.vendor(util.format('minirev/%s/minirev%s', supportedAbi, abi.pie ? '' : '-nopie'))
                }))
                , dest: [
                    '/data/local/tmp/minirev'
                    , '/data/data/com.android.shell/minirev'
                ]
                , comm: 'minirev'
                , mode: 0o755
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
            return devutil.killProcsByComm(adb, options.serial, resources.bin.comm, resources.bin.dest)
        }
        return stop()
            .then(installAll)
            .then(function() {
                return {
                    bin: resources.bin.dest
                }
            })
    })
