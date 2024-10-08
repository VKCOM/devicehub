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
    function removeResource(res) {
        return adb.getDevice(options.serial).shell(['rm', '-f', res.dest])
            .then(function(out) {
            return streamutil.readAll(out)
        })
            .return(res)
    }
    function pushResource(res) {
        return adb.getDevice(options.serial).push(res.src, res.dest, res.mode)
            .then(function(transfer) {
            return new Promise(function(resolve, reject) {
                transfer.on('error', reject)
                transfer.on('end', resolve)
            })
        })
            .return(res)
    }
    function installResource(res) {
        log.info('Installing "%s" as "%s"', res.src, res.dest)
        function checkExecutable(res) {
            return adb.getDevice(options.serial).stat(res.dest)
                .then(function(stats) {
                return (stats.mode & fs.constants.S_IXUSR) === fs.constants.S_IXUSR
            })
        }
        return removeResource(res)
            .then(pushResource)
            .then(function(res) {
            return checkExecutable(res).then(function(ok) {
                if (!ok) {
                    log.info('Pushed "%s" not executable, attempting fallback location', res.comm)
                    res.shift()
                    return installResource(res)
                }
                return res
            })
        })
            .return(res)
    }
    function installAll() {
        return Promise.all([
            installResource(resources.bin)
        ])
    }
    function stop() {
        return devutil.killProcsByComm(adb, options.serial, resources.bin.comm, resources.bin.dest)
            .timeout(15000)
    }
    return stop()
        .then(installAll)
        .then(function() {
        return {
            bin: resources.bin.dest
        }
    })
})
