import {finished} from 'stream/promises'
import fs from 'fs/promises'
import url from 'url'
import {once} from 'node:events'
import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
// import request from 'postman-request'
import Bluebird from 'bluebird'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import * as promiseutil from '../../../util/promiseutil.js'
import temp from 'tmp-promise'
import {Utils} from '@u4/adbkit'
import adb from '../support/adb.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import {Readable} from 'stream'
import {createWriteStream} from 'fs'
// The error codes are available at https://github.com/android/
// platform_frameworks_base/blob/master/core/java/android/content/
// pm/PackageManager.java
function InstallationError(err) {
    return err.code && /^INSTALL_/.test(err.code)
}

// @ts-ignore
const readAll = async(stream) => Utils.readAll(stream)

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
            let jwt = message.jwt
            log.info('Installing package "%s" from "%s"', pkg, message.href)
            let reply = wireutil.reply(options.serial)
            function sendProgress(data, progress) {
                if (isApi) {
                    return
                }
                push.send([
                    channel,
                    reply.progress(data, progress)
                ])
            }
            sendProgress('starting', 0)

            /**
             * @returns {Promise<string>}
             */
            async function pushApp(channel) {
                let href = message.href
                const apkUrl = url.resolve(options.storageUrl, href)
                let res = await fetch(apkUrl, {
                    headers: {
                        channel: channel,
                        Authorization: `Bearer ${jwt}`,
                        device: options.serial
                    }
                })
                log.info('Reading', apkUrl, ' returned: ', res.status)
                if (res.status >= 300) {
                    throw Error(`Could not download file. Server returned status = ${res.status}, ${await res.text()}`)
                }
                if (res.body === null) {
                    throw Error(`Could not download file. Server returned no body and status = ${res.status}`)
                }
                const destination = await temp.file()
                log.info(`Downloadnig to ${destination.path}`)
                const fileStream = createWriteStream(destination.path)
                await finished(Readable.fromWeb(res.body).pipe(fileStream))
                const stats = await fs.stat(destination.path)
                log.info(`Downloaded file. Size: ${stats.size}`)

                let target = '/data/local/tmp/install_app.apk'

                log.info('Started pushing apk')

                const transfer = await adb.getDevice(options.serial).push(destination.path, target, 0o755)

                // TODO: Doesn't work
                // transfer.on('progress', (p) => {
                //     const percent = p.bytesTransferred * 100 / stats.size
                //     log.info(`Push progress: ${p.bytesTransferred} bytes transferred [${percent}]`)
                //     sendProgress('pushing_app', Math.ceil(percent))
                // })

                let transferError
                transfer.on('error', (error) => transferError = error) // work?

                await transfer.waitForEnd()
                if (transferError) {
                    throw new Error(`Push transfer error: ${transferError}`)
                }

                log.info('Push completed successfully')

                // small delay to ensure file system sync
                await new Promise(r => setTimeout(r, 500))

                try {
                    const apkstats = await adb.getDevice(options.serial).stat(target)
                    log.info(`File verification successful. Stats: ${JSON.stringify(apkstats)}`)

                    if (apkstats.size === 0) {
                        throw new Error('File was pushed but has zero size')
                    }

                    sendProgress('pushing_app', 50)

                    await destination.cleanup()
                    log.info('Push verified and temp file cleaned up')
                    return target
                }
                catch (/** @type {any}*/error) {
                    await destination.cleanup()
                    throw new Error(`Failed to verify pushed file: ${error?.message || error}`)
                }
            }
            // Progress 0%
            sendProgress('pushing_app', 0)
            Bluebird.resolve(pushApp(channel))
                .then(function(apkPath) {
                    let start = 50
                    let end = 90
                    let guesstimate = start
                    let installCmd = 'pm install '
                    if (installFlags.length > 0) {
                        installCmd += installFlags.join(' ') + ' '
                    }
                    installCmd += apkPath
                    log.info('Install command: ' + installCmd)
                    sendProgress('installing_app', guesstimate)
                    return promiseutil.periodicNotify(adb.getDevice(options.serial).shell(installCmd)
                        .then((r) => {
                            return readAll(r)
                                .then(buffer => {
                                    let result = buffer.toString()
                                    log.info('Installing result ' + result)
                                    if (result.includes('Success')) {
                                        push.send([
                                            channel,
                                            reply.okay('Installed successfully')
                                        ])
                                        push.send([
                                            channel,
                                            wireutil.envelope(new wire.InstallResultMessage(options.serial, 'Installed successfully'))
                                        ])
                                    }
                                    else {
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
                                                channel,
                                                reply.fail(result)
                                            ])
                                            push.send([
                                                channel,
                                                wireutil.envelope(new wire.InstallResultMessage(options.serial, 'Tried to install package ' + pkg + ', got ' + result))
                                            ])
                                            return Bluebird.reject(result)
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
                                                action: 'android.intent.action.MAIN',
                                                component: util.format('%s/%s', pkg, activityName),
                                                category: ['android.intent.category.LAUNCHER'],
                                                flags: 0x10200000
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
                            return Bluebird.reject(err)
                        }), 250)
                        .then(function() {
                            // Progress updates without .progressed() method
                            if (!isApi) {
                                return
                            }
                            guesstimate = Math.min(end, guesstimate + 1.5 * (end - guesstimate) / (end - start))
                            sendProgress('installing_app', guesstimate)
                        })
                })
                .catch(Bluebird.TimeoutError, function(err) {
                    log.error('Installation of package "%s" failed', pkg, err.stack)
                    push.send([
                        channel,
                        reply.fail('INSTALL_ERROR_TIMEOUT')
                    ])
                })
                .catch(function(err) {
                    log.error('Installation of package "%s" failed', pkg, err.stack)
                    push.send([
                        channel,
                        reply.fail('INSTALL_ERROR_UNKNOWN')
                    ])
                })
        })
        router.on(wire.UninstallMessage, function(channel, message) {
            log.info('Uninstalling "%s"', message.packageName)
            let reply = wireutil.reply(options.serial)
            adb.getDevice(options.serial).uninstall(message.packageName)
                .then(function() {
                    push.send([
                        channel,
                        reply.okay('success')
                    ])
                })
                .catch(function(err) {
                    log.error('Uninstallation failed', err.stack)
                    push.send([
                        channel,
                        reply.fail('fail')
                    ])
                })
        })
    })
