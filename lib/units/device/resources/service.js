import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
import ProtoBuf from 'protobufjs'
import semver from 'semver'
import * as pathutil from '../../../util/pathutil.cjs'
import * as streamutil from '../../../util/streamutil.js'
import logger from '../../../util/logger.js'
import adbkit from '@irdk/adbkit'
import adb from '../support/adb.js'
export default syrup.serial()
    .dependency(adb)
    .define(function(options, adb) {
        let log = logger.createLogger('device:resources:service')
        let builder = ProtoBuf.loadProtoFile(pathutil.vendor('STFService/wire.proto'))
        let STFServiceResource = {
            requiredVersion: '3.0.0',
            pkg: 'jp.co.cyberagent.stf',
            main: 'jp.co.cyberagent.stf.Agent',
            apk: pathutil.vendor('STFService/STFService.apk'),
            wire: builder.build().jp.co.cyberagent.stf.proto,
            builder: builder,
            startIntent: {
                action: 'jp.co.cyberagent.stf.ACTION_START',
                component: 'jp.co.cyberagent.stf/.Service'
            }
        }
        // am startservice -a jp.co.cyberagent.stf.ACTION_START jp.co.cyberagent.stf/.Service
        function getPath() {
            log.info('Calling getPath()')
            return adb.getDevice(options.serial).shell(['pm', 'path', STFServiceResource.pkg])
                .then(function(out) {
                    return streamutil.findLine(out, (/^package:/))
                        .timeout(15000)
                        .then(function(line) {
                            log.info(`getPath pm exec returned ${line}`)
                            return line.substr(8)
                        })
                })
        }
        function install() {
            log.info('Checking whether we need to install STFService')
            return getPath()
                .then(function(installedPath) {
                    log.info('Running version check')
                    return adb.getDevice(options.serial).shell(util.format("CLASSPATH='%s' exec app_process /system/bin '%s' --version 2>/dev/null", installedPath, STFServiceResource.main))
                        .then(function(out) {
                            return streamutil.readAll(out)
                                .timeout(10000)
                                .then(function(buffer) {
                                    let version = buffer.toString()
                                    if (semver.satisfies(version, STFServiceResource.requiredVersion)) {
                                        return installedPath
                                    }
                                    else {
                                        throw new Error(util.format('Incompatible version %s', version))
                                    }
                                })
                        })
                })
                .catch(function() {
                    log.info('Installing STFService')
                    return adb.getDevice(options.serial).install(STFServiceResource.apk)
                        .then(function() {
                            log.info('Installed sucessfully')
                            return getPath()
                        }).catch((e) => {
                            log.error('INSTALLING ERROR' + e)
                        })
                })
        }
        function setPermission(path) {
            return adb.getDevice(options.serial).shell([
                'pm', 'grant', STFServiceResource.pkg,
                'android.permission.BLUETOOTH_CONNECT',
                'android.permission.SYSTEM_ALERT_WINDOW'
            ])
                .then(adbkit.Adb.util.readAll)
                .then(function(out) {
                    log.debug('output of granting permissions to STFService: ' + out.toString())
                    return path
                })
        }
        return install()
            .then(setPermission)
            .then(function(path) {
                adb.getDevice(options.serial).shell('ime enable jp.co.cyberagent.stf/.ADBKeyBoardService')
                adb.getDevice(options.serial).shell('ime set jp.co.cyberagent.stf/.ADBKeyBoardService')
                log.info('STFService up to date')
                STFServiceResource.path = path
                return STFServiceResource
            })
    })
