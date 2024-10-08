import stream from 'stream'
import url from 'url'
import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
import request from 'postman-request'
import Promise from 'bluebird'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import * as promiseutil from '../../../util/promiseutil.js'
import adbkit from '@devicefarmer/adbkit'
import apiutil from '../../../util/apiutil.js'
import adb from '../support/adb.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
// The error codes are available at https://github.com/android/
// platform_frameworks_base/blob/master/core/java/android/content/
// pm/PackageManager.java
function InstallationError(err) {
    return err.code && /^INSTALL_/.test(err.code)
}
export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(push)
    .define(function(options, adb, router, push) {
    let log = logger.createLogger('device:plugins:install')
    router.on(wire.InstallMessage, function(channel, message) {
        let manifest = JSON.parse(message.manifest)
        let pkg = manifest.package
        let installFlags = message.installFlags
        let isApi = message.isApi
        log.info('Installing package "%s" from "%s"', pkg, message.href)
        let reply = wireutil.reply(options.serial)
        function sendProgress(data, progress) {
            if (isApi) {
                return
            }
            push.send([
                channel
                , reply.progress(data, progress)
            ])
        }
        function pushApp(channel) {
            let href = message.href
            let contentLength = null
            let req = request(url.resolve(options.storageUrl, href), {
                headers: {
                    channel: channel
                    , device: options.serial
                }
                , timeout: apiutil.INSTALL_APK_WAIT
            })
            // We need to catch the Content-Length on the fly or we risk
            // losing some of the initial chunks.
            req.on('response', function(res) {
                contentLength = parseInt(res.headers['content-length'], 10)
            })
            req.on('error', function(err) {
                log.error(err)
            })
            let source = new stream.Readable().wrap(req)
            let target = '/data/local/tmp/_app.apk'
            return adb.getDevice(options.serial).push(source, target)
                .then(function(transfer) {
                let resolver = Promise.defer()
                function progressListener(stats) {
                    if (contentLength) {
                        // Progress 0% to 70%
                        sendProgress('pushing_app', 50 * Math.max(0, Math.min(50, stats.bytesTransferred / contentLength)))
                        // temporary workaround as the 'end' event is never fired
                        if (stats.bytesTransferred === contentLength) {
                            setTimeout(() => {
                                endListener()
                            }, apiutil.ONE_SECOND)
                        }
                    }
                }
                function errorListener(err) {
                    resolver.reject(err)
                }
                function endListener() {
                    resolver.resolve(target)
                }
                transfer.on('progress', progressListener)
                transfer.on('error', errorListener)
                transfer.on('end', endListener)
                return resolver.promise.finally(function() {
                    transfer.removeListener('progress', progressListener)
                    transfer.removeListener('error', errorListener)
                    transfer.removeListener('end', endListener)
                })
            })
        }
        // Progress 0%
        sendProgress('pushing_app', 0)
        pushApp(channel)
            .then(function(apk) {
            let start = 50
            let end = 90
            let guesstimate = start
            let installCmd = 'pm install '
            if (installFlags.length > 0) {
                installCmd += installFlags.join(' ') + ' '
            }
            installCmd += apk
            log.info('Install command: ' + installCmd)
            sendProgress('installing_app', guesstimate)
            return promiseutil.periodicNotify(adb.getDevice(options.serial).shell(installCmd)
                .then((r) => {
                adbkit.Adb.util.readAll(r)
                    .then(buffer => {
                    let result = buffer.toString()
                    log.info('Installing result ' + result)
                    if (result.includes('Success')) {
                        push.send([
                            channel
                            , reply.okay('Installed successfully')
                        ])
                        push.send([
                            channel
                            , wireutil.envelope(new wire.InstallResultMessage(options.serial, 'Installed successfully'))
                        ])
                    }
                    else {
                        // eslint-disable-next-line max-len
                        if (result.includes('INSTALL_PARSE_FAILED_INCONSISTENT_CERTIFICATES') || result.includes('INSTALL_FAILED_VERSION_DOWNGRADE')) {
                            log.info('Uninstalling "%s" first due to inconsistent certificates', pkg)
                            return adb.getDevice(options.serial).uninstall(pkg)
                                .then(function() {
                                return adb.getDevice(options.serial).shell(installCmd)
                            })
                        }
                        else {
                            log.error('Tried to install package "%s", got "%s"', pkg, result)
                            push.send([
                                channel
                                , reply.fail(result)
                            ])
                            push.send([
                                channel
                                , wireutil.envelope(new wire.InstallResultMessage(options.serial, 'Tried to install package ' + pkg + ', got ' + result))
                            ])
                            return Promise.reject(result)
                        }
                    }
                })
                    .then(function() {
                    if (message.launch) {
                        if (manifest.application.launcherActivities.length) {
                            let activityName = 'MainActivity'
                            // According to the AndroidManifest.xml documentation the dot is
                            // required, but actually it isn't.
                            if (activityName.indexOf('.') === -1) {
                                activityName = util.format('.%s', activityName)
                            }
                            let launchActivity = {
                                action: 'android.intent.action.MAIN'
                                , component: util.format('%s/%s', pkg, activityName)
                                , category: ['android.intent.category.LAUNCHER']
                                , flags: 0x10200000
                            }
                            log.info('Launching activity with action "%s" on component "%s"', launchActivity.action, launchActivity.component)
                            // Progress 90%
                            sendProgress('launching_app', 90)
                            return adb.getDevice(options.serial).startActivity(launchActivity)
                        }
                    }
                })
            })
                .catch(function(err) {
                log.error('Error while installation \n')
                log.error(err)
                return Promise.reject(err)
            }), 250)
                .progressed(function() {
                if (!isApi) {
                    return
                }
                guesstimate = Math.min(end, guesstimate + 1.5 * (end - guesstimate) / (end - start))
                sendProgress('installing_app', guesstimate)
            })
        })
            .catch(Promise.TimeoutError, function(err) {
            log.error('Installation of package "%s" failed', pkg, err.stack)
            push.send([
                channel
                , reply.fail('INSTALL_ERROR_TIMEOUT')
            ])
        })
            .catch(function(err) {
            log.error('Installation of package "%s" failed', pkg, err.stack)
            push.send([
                channel
                , reply.fail('INSTALL_ERROR_UNKNOWN')
            ])
        })
    })
    router.on(wire.UninstallMessage, function(channel, message) {
        log.info('Uninstalling "%s"', message.packageName)
        let reply = wireutil.reply(options.serial)
        adb.getDevice(options.serial).uninstall(message.packageName)
            .then(function() {
            push.send([
                channel
                , reply.okay('success')
            ])
        })
            .catch(function(err) {
            log.error('Uninstallation failed', err.stack)
            push.send([
                channel
                , reply.fail('fail')
            ])
        })
    })
})
