import fs from 'fs/promises'
import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
import Bluebird from 'bluebird'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import * as promiseutil from '../../../util/promiseutil.js'
import {Utils} from '@u4/adbkit'
import adb from '../support/adb.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import storage from '../../base-device/support/storage.js'

// @ts-ignore
const readAll = async(stream) => Utils.readAll(stream)

export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(push)
    .dependency(storage)
    .define(function(options, adb, router, push, storage) {
        const log = logger.createLogger('device:plugins:install')
        const reply = wireutil.reply(options.serial)

        router.on(wire.InstallMessage, async(channel, message) => {
            const manifest = JSON.parse(message.manifest)
            const pkg = manifest.package
            const installFlags = message.installFlags
            const isApi = message.isApi
            const jwt = message.jwt

            log.info('Installing package "%s" from "%s"', pkg, message.href)

            const sendProgress = (data, progress) => {
                if (!isApi) {
                    push.send([
                        channel,
                        reply.progress(data, progress)
                    ])
                }
            }

            /**
             * @returns {Promise<string>}
             */
            const pushApp = async(channel) => {
                try {
                    const {path, cleanup} = await storage.download(message.href, channel, jwt)
                    const stats = await fs.stat(path)

                    log.info(`Downloaded file. Size: ${stats.size}`)
                    log.info('Started pushing apk')

                    const target = '/data/local/tmp/install_app.apk'
                    const transfer = await adb.getDevice(options.serial)
                        .push(path, target, 0o755)

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
                        if (apkstats.size === 0) {
                            throw new Error('File was pushed but has zero size')
                        }

                        log.info(`File verification successful. Stats: ${JSON.stringify(apkstats)}`)

                        sendProgress('pushing_app', 50)

                        await cleanup()
                        log.info('Push verified and temp file cleaned up')

                        return target
                    }
                    catch (/** @type {any}*/error) {
                        await cleanup()
                        log.error(`Failed to verify pushed file: ${error?.message || error}`)
                    }
                }
                catch (err) {
                    log.error('Pushing file on device failed:', err)
                }
            }

            const install = async(installCmd) => {
                try {
                    const r = await adb.getDevice(options.serial).shell(installCmd)
                    const buffer = await readAll(r)
                    const result = buffer.toString()
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
                            adb.getDevice(options.serial).uninstall(pkg)
                                .then(() => adb.getDevice(options.serial).shell(installCmd))
                        }
                        else {
                            log.error('Tried to install package "%s", got "%s"', pkg, result)
                            push.send([
                                channel,
                                reply.fail(result)
                            ])
                            push.send([
                                channel,
                                wireutil.envelope(new wire.InstallResultMessage(options.serial, `Tried to install package ${pkg}, got ${result}`))
                            ])
                            throw new Error(result)
                        }
                    }
                    if (message.launch) {
                        if (manifest.application.launcherActivities.length) {
                            // According to the AndroidManifest.xml documentation the dot is
                            // required, but actually it isn't.
                            const activityName = '.MainActivity'
                            const launchActivity = {
                                action: 'android.intent.action.MAIN',
                                component: util.format('%s/%s', pkg, activityName),
                                category: ['android.intent.category.LAUNCHER'],
                                flags: 0x10200000
                            }
                            log.info('Launching activity with action "%s" on component "%s"', launchActivity.action, launchActivity.component)
                            // Progress 90%
                            sendProgress('launching_app', 90)

                            const result = await adb.getDevice(options.serial).startActivity(launchActivity)
                            if (result) {
                                sendProgress('launching_app', 100)
                            }
                        }
                    }
                }
                catch (err) {
                    log.error('Error while installation \n')
                    log.error(err)
                    throw err
                }
            }

            // Progress 0%
            sendProgress('pushing_app', 0)
            const apkPath = await pushApp(channel)
            try {
                let installCmd = 'pm install '
                if (installFlags.length > 0) {
                    installCmd += installFlags.join(' ') + ' '
                }

                installCmd += apkPath

                log.info('Install command: ' + installCmd)
                sendProgress('installing_app', 50)


                await promiseutil.periodicNotify(
                    install(installCmd),
                    250
                )
            }
            catch (err) {
                if (err instanceof Bluebird.TimeoutError) {
                    log.error('Installation of package "%s" failed', pkg, err.stack)
                    push.send([
                        channel,
                        reply.fail('INSTALL_ERROR_TIMEOUT')
                    ])
                    return
                }

                log.error('Installation of package "%s" failed', pkg, err.stack)
                push.send([
                    channel,
                    reply.fail('INSTALL_ERROR_UNKNOWN')
                ])
            }
        })

        router.on(wire.UninstallMessage, async(channel, message) => {
            log.info('Uninstalling "%s"', message.packageName)
            try {
                await adb.getDevice(options.serial).uninstall(message.packageName)
                push.send([
                    channel,
                    reply.okay('success')
                ])
            }
            catch (err) {
                log.error('Uninstallation failed', err.stack)
                push.send([
                    channel,
                    reply.fail('fail')
                ])
            }
        })
    })
