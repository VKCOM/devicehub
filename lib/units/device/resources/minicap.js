import util from 'util'
import path from 'path'
import Promise from 'bluebird'
import syrup from '@devicefarmer/stf-syrup'
import fs from 'fs'
import logger from '../../../util/logger.js'
import * as pathutil from '../../../util/pathutil.cjs'
import devutil from '../../../util/devutil.js'
import * as streamutil from '../../../util/streamutil.js'
import Resource from './util/resource.js'
import adb from '../support/adb.js'
import properties from '../support/properties.js'
import abi from '../support/abi.js'
import sdk from '../support/sdk.js'
export default syrup.serial()
    .dependency(adb)
    .dependency(properties)
    .dependency(abi)
    .dependency(sdk)
    .define(function(options, adb, properties, abi, sdk) {
    let log = logger.createLogger('device:resources:minicap')
    let resources = {
        bin: new Resource({
            src: pathutil.requiredMatch(abi.all.map(function(supportedAbi) {
                return pathutil.module(util.format('@devicefarmer/minicap-prebuilt/prebuilt/%s/bin/minicap%s', supportedAbi, abi.pie ? '' : '-nopie'))
            }))
            , dest: [
                '/data/local/tmp/minicap'
                , '/data/data/com.android.shell/minicap'
            ]
            , comm: 'minicap'
            , mode: 0o755
        })
        , lib: new Resource({
            // @todo The lib ABI should match the bin ABI. Currently we don't
            // have an x86_64 version of the binary while the lib supports it.
            src: pathutil.match(abi.all.reduce(function(all, supportedAbi) {
                return all.concat([
                    pathutil.module(util.format('@devicefarmer/minicap-prebuilt/prebuilt/%s/lib/android-%s/minicap.so', supportedAbi, sdk.previewLevel))
                    , pathutil.module(util.format('@devicefarmer/minicap-prebuilt/prebuilt/%s/lib/android-%s/minicap.so', supportedAbi, sdk.level))
                ])
            }, []))
            , dest: [
                '/data/local/tmp/minicap.so'
                , '/data/data/com.android.shell/minicap.so'
            ]
            , comm: 'minicap.so' // Not actually used for anything but log output
            , mode: 0o755
        })
        , apk: new Resource({
            src: pathutil.match([pathutil.module('@devicefarmer/minicap-prebuilt/prebuilt/noarch/minicap.apk')])
            , dest: ['/data/local/tmp/minicap.apk']
            , comm: 'minicap.apk'
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
        let resourcesToBeinstalled = []
        if (resources.lib.src !== undefined) {
            resourcesToBeinstalled.push(installResource(resources.bin))
            resourcesToBeinstalled.push(installResource(resources.lib))
        }
        if (resources.apk.src !== undefined) {
            resourcesToBeinstalled.push(installResource(resources.apk))
        }
        return Promise.all(resourcesToBeinstalled)
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
            , lib: resources.lib.dest
            , apk: resources.apk.dest
            , run: function(mode, cmd) {
                let runCmd
                if (sdk.level >= 23) { // Use webp
                    runCmd = util.format('CLASSPATH=%s app_process /system/bin io.devicefarmer.minicap.Main %s', resources.apk.dest, cmd)
                }
                else { // Use jpeg
                    if (mode === 'minicap-bin' && resources.lib.src !== undefined) {
                        runCmd = util.format('LD_LIBRARY_PATH=%s exec %s %s', path.dirname(resources.lib.dest), resources.bin.dest, cmd)
                    }
                    else if (mode === 'minicap-apk' && resources.apk.src !== undefined) {
                        runCmd = util.format('CLASSPATH=%s app_process /system/bin io.devicefarmer.minicap.Main %s', resources.apk.dest, cmd)
                    }
                    else {
                        log.error('Missing resources/unknown minicap grabber: %s', mode)
                    }
                }
                log.info(runCmd)
                return adb.getDevice(options.serial).shell(runCmd)
            }
        }
    })
})
