import syrup from '@devicefarmer/stf-syrup'
import logger from '../../util/logger.js'
import lifecycle from '../../util/lifecycle.js'
import heartbeat from '../base-device/plugins/heartbeat.js'
import solo from '../base-device/plugins/solo.js'
import info from './plugins/info.js'
import wdaClient from './plugins/wda/client.js'
import wda from './plugins/wda/index.js'
import push from '../base-device/support/push.js'
import sub from '../base-device/support/sub.js'
import group from '../base-device/plugins/group.js'
import storage from '../base-device/support/storage.js'
import devicelog from './plugins/devicelog.js'
import stream from './plugins/screen/stream.js'
import install from './plugins/install.js'
import reboot from './plugins/reboot.js'
import clipboard from './plugins/clipboard.js'
import remotedebug from './plugins/remotedebug.js'
import filesystem from './plugins/filesystem.js'
import connect from './plugins/wda/connect.js'
import {DeviceAbsentMessage, DeviceStatus, DeviceStatusMessage} from "../../wire/wire.js"
import wireutil from "../../wire/util.js"
import {WebDriverAgent} from "appium-webdriveragent"
import { openPort } from "./redirect-ports.js"

interface Options {
    serial: string
    provider: string
    isSimulator: boolean
    wdaPath: string
    wdaHost: string
    wdaPort: number
    mjpegPort: number

    publicIp: string,
    endpoints: {
        sub: string[]
        push: string[]
    },
    groupTimeout: number
    storageUrl: string
    screenJpegQuality: string
    screenPingInterval: number
    screenPort: number
    screenWsUrlPattern: string
    connectUrlPattern: string
    heartbeatInterval: number
    lockRotation: boolean
    cleanup: boolean
    screenReset: boolean
    deviceName: string
    host: string
    esp32Path: string
    secret: string
    connectPort: number
    disableLogsOverWire: boolean
}

export default (async(options: Options) => {
    const [stopWDAPortForwarding, stopMJPEGPortForwarding] = options.isSimulator
        ? [async() => {}, async() => {}]
        : await Promise.all([
            openPort(options.wdaPort, options.wdaPort, options.serial),
            openPort(options.mjpegPort, options.mjpegPort, options.serial),
        ])

    const stopPortForwarding = async() => {
        if (options.isSimulator) return
        await Promise.all([
            stopWDAPortForwarding(),
            stopMJPEGPortForwarding()
        ])
    }

    const WDA = new WebDriverAgent({
        device: {udid: options.serial},
        realDevice: !options.isSimulator,
        wdaRemotePort: options.wdaPort,
        wdaConnectionTimeout: 60_000,
        wdaLaunchTimeout: 60_000,
        prebuildWDA: true,
        usePrebuiltWDA: false,
        mjpegServerPort: options.mjpegPort,
        usePreinstalledWDA: false,
        allowProvisioningDeviceRegistration: true,
        showXcodeLog: true,
        updatedWDABundleId: 'com.dhub.WebDriverAgentRunner'
    })

    lifecycle.observe(async() => {
        await WDA.quit()
        await stopPortForwarding()
    })

    const waitWDA = async(attempts = 100) => {
        try {
            const response = await fetch(`http://${options.wdaHost}:${options.wdaPort}/status`)
            const res = await response.json()
            if (res?.value?.state !== 'success') {
                throw new Error(`WebDriverAgent error: invalid state ${JSON.stringify(res)}`)
            }

            return
        } catch (e) {
            if (--attempts) {
                await new Promise(r => setTimeout(r, 1000))
                return waitWDA(attempts)
            }
            throw e
        }
    }

    try {
        await WDA.setupCaching()
        await WDA.launch(options.provider)
        await new Promise(r => setTimeout(r, 5000))
        await waitWDA()
    } catch (e: any) {
        await WDA.quit()
        await stopPortForwarding()

        lifecycle.fatal(e)
    }


    return syrup.serial()
        .dependency(heartbeat)
        .dependency(wdaClient)
        .dependency(push)
        .dependency(wda)
        .define(async(options, heartbeat, wdaClient, push) => {
            const log = logger.createLogger('ios-device')
            log.info('Preparing device options: %s', JSON.stringify(options))

            push.send([
                wireutil.global,
                wireutil.pack(DeviceStatusMessage, {
                    serial: options.serial,
                    status: DeviceStatus.CONNECTING
                })
            ])

            const absentDevice = () =>
                push.send([
                    wireutil.global,
                    wireutil.pack(DeviceAbsentMessage, { serial: options.serial })
                ])

            let failedWdaChecks = 0
            wdaClient.once('connected', () => {
                heartbeat.on('beat', async() => {
                    if (await wdaClient.healthCheck()) {
                        failedWdaChecks = 0
                        return
                    }

                    if (++failedWdaChecks >= 4) {
                        absentDevice()
                        lifecycle.fatal('WDA request error: unable to get response')
                    }
                })
            })

            return syrup.serial()
                .dependency(solo)
                .dependency(info)
                .dependency(connect)
                .dependency(group)
                .dependency(sub)
                .dependency(storage)
                .dependency(devicelog)
                .dependency(stream)
                .dependency(install)
                .dependency(reboot)
                .dependency(clipboard)
                .dependency(remotedebug)
                .dependency(filesystem)
                .define(async(options, solo, info, connect, group) => {
                    try {

                        // one-time session for init additional device info
                        await new Promise<void>(resolve => {
                            wdaClient.once('connected', async() => {
                                await wdaClient.startSession()
                                await wdaClient.stopSession()
                                resolve()
                            })
                            wdaClient.connect()
                        })

                        group.on('join', async() => {
                            await wdaClient.startSession()
                        })

                        group.on('leave', async() => {
                            await wdaClient.lock()
                            await wdaClient.stopSession()
                        })

                        connect()
                        solo.poke()

                        push.send([
                            wireutil.global,
                            wireutil.pack(DeviceStatusMessage, {
                                serial: options.serial,
                                status: DeviceStatus.ONLINE
                            })
                        ])

                        if (process.send) {
                            process.send('ready')
                        }
                    }
                    catch (err: any) {
                        lifecycle.fatal(err)
                    }
                })
                .consume(options)
        })
        .consume(options)
        .catch((err) => {
            lifecycle.fatal(err)
        })
})
