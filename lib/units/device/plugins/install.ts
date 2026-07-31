import fs from 'fs/promises'
import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wireutil from '../../../wire/util.js'
import * as promiseutil from '../../../util/promiseutil.js'
import {Utils} from '@u4/adbkit'
import adb from '../support/adb.js'
import router from '../../base-device/support/router.js'
import transport from '../../base-device/support/transport.js'
import storage from '../../base-device/support/storage.js'
import {InstallMessage, InstallResultMessage, UninstallMessage} from '../../../wire/wire.js'

interface InstallOptions {
    serial: string
    [key: string]: any
}

interface Manifest {
    package: string
    application: {
        launcherActivities: any[]
        [key: string]: any
    }
    [key: string]: any
}

export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(transport)
    .dependency(storage)
    .define((options: InstallOptions, adb: any, router: any, transport: any, storage: any) => {
        const log = logger.createLogger('device:plugins:install')
        const reply = wireutil.reply(options.serial)

        router.on(InstallMessage, async (channel: string, message: any) => {
            const manifest: Manifest = JSON.parse(message.manifest)
            const pkg = manifest.package
            const installFlags: string[] = message.installFlags
            const isApi: boolean = message.isApi
            const jwt: string = message.jwt

            log.info('Installing package "%s" from "%s"', pkg, message.href)

            const sendProgress = (data: string, progress: number): void => {
                if (!isApi) {
                    transport.send([
                        channel,
                        reply.progress(data, progress)
                    ])
                }
            }

            const pushApp = async (channel: string): Promise<string | undefined> => {
                try {
                    const {path, cleanup} = await storage.download(message.href, channel, jwt)
                    const stats = await fs.stat(path)

                    log.info(`Downloaded file. Size: ${stats.size}`)
                    log.info('Started pushing apk')

                    const target = '/data/local/tmp/install_app.apk'
                    const transfer = await adb.getDevice(options.serial)
                        .push(path, target, 0o755)

                    let transferError: Error | undefined
                    transfer.on('error', (error: Error) => transferError = error)

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
                    catch (error: any) {
                        await cleanup()
                        log.error(`Failed to verify pushed file: ${error?.message || error}`)
                    }
                }
                catch (err: any) {
                    log.error('Pushing file on device failed: %s', err)
                }
            }

            const install = async (installCmd: string, attempt = 0): Promise<void> => {
                try {
                    const r = await adb.getDevice(options.serial).shell(installCmd)
                    const buffer = await Utils.readAll(r)
                    const result = buffer.toString()
                    log.info('Installing result ' + result)
                    if (result.includes('Success')) {
                        transport.send([
                            channel,
                            reply.okay('Installed successfully')
                        ])
                        transport.send([
                            channel,
                            wireutil.pack(InstallResultMessage, {
                                serial: options.serial,
                                result: 'Installed successfully'
                            })
                        ])
                    }
                    else {
                        if (result.includes('INSTALL_PARSE_FAILED_INCONSISTENT_CERTIFICATES') || result.includes('INSTALL_FAILED_VERSION_DOWNGRADE')) {
                            if (attempt) {
                                throw new Error(result)
                            }

                            log.info('Uninstalling "%s" first due to inconsistent certificates', pkg)
                            await adb.getDevice(options.serial).uninstall(pkg)
                            return install(installCmd, 1)
                        }
                        else {
                            log.error('Tried to install package "%s", got "%s"', pkg, result)

                            transport.send([
                                channel,
                                reply.fail(result)
                            ])

                            transport.send([
                                channel,
                                wireutil.pack(InstallResultMessage, {
                                    serial: options.serial,
                                    result: `Tried to install package ${pkg}, got ${result}`
                                })
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
                catch (err: any) {
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
            catch (err: any) {
                // Check for timeout-like errors
                if (err?.name === 'TimeoutError' || err?.message?.includes('timeout')) {
                    log.error('Installation of package "%s" failed: %s', pkg, err.stack)
                    transport.send([
                        channel,
                        reply.fail('INSTALL_ERROR_TIMEOUT')
                    ])
                    return
                }

                log.error('Installation of package "%s" failed: %s', pkg, err)
                transport.send([
                    channel,
                    reply.fail('INSTALL_ERROR_UNKNOWN')
                ])
            }
        })

        router.on(UninstallMessage, async (channel: string, message: any) => {
            log.info('Uninstalling "%s"', message.packageName)
            try {
                await adb.getDevice(options.serial).uninstall(message.packageName)
                transport.send([
                    channel,
                    reply.okay('success')
                ])
            }
            catch (err: any) {
                log.error('Uninstallation failed: %s', err)
                transport.send([
                    channel,
                    reply.fail('fail')
                ])
            }
        })
    })
