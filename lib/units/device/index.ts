import syrup from '@devicefarmer/stf-syrup'
import lifecycle from '../../util/lifecycle.js'
import logger$0 from '../base-device/support/logger.js'
import heartbeat from '../base-device/plugins/heartbeat.js'
import solo from './plugins/solo.js'
import stream from './plugins/screen/stream.js'
import capture from './plugins/screen/capture.js'
import service from './plugins/service.js'
import browser from './plugins/browser.js'
import store from './plugins/store.js'
import airplane from './plugins/airplane.js'
import clipboard from './plugins/clipboard.js'
import logcat from './plugins/logcat.js'
import mute from './plugins/mute.js'
import shell from './plugins/shell.js'
import touch from './plugins/touch/index.js'
import install from './plugins/install.js'
import forward from './plugins/forward/index.js'
import group from './plugins/group.js'
import cleanup from './plugins/cleanup.js'
import reboot from './plugins/reboot.js'
import connect from './plugins/connect.js'
import account from './plugins/account.js'
import ringer from './plugins/ringer.js'
import wifi from './plugins/wifi.js'
import bluetooth from './plugins/bluetooth.js'
import sd from './plugins/sd.js'
import filesystem from './plugins/filesystem.js'
import mobileService from './plugins/mobile-service.js'
import remotedebug from './plugins/remotedebug.js'
import vnc from './plugins/vnc/index.js'
import {trackModuleReadyness} from './readyness.js'
import wireutil, {DEVICE_STATUS_MAP} from '../../wire/util.js'
import push from '../base-device/support/push.js'
import adb from './support/adb.js'
import router from '../base-device/support/router.js'
import {DeviceIntroductionMessage, DeviceRegisteredMessage, ProviderMessage} from "../../wire/wire.js";

export default (function(options: any) {
    return syrup.serial()
        // We want to send logs before anything else starts happening
        .dependency(logger$0)
        .dependency(push)
        .dependency(adb)
        .dependency(router)
        .dependency(trackModuleReadyness('solo', solo))
        .define(async(options, logger, push, adb, router, solo) => {
            const log = logger.createLogger('device')
            log.info('Preparing device')

            if (!options.provider) {
                let listener: ((...args: any[]) => void) | null = null
                const waitRegister = Promise.race([
                    new Promise(resolve =>
                        router.on(DeviceRegisteredMessage, listener = (...args: any[]) => resolve(args))
                    ),
                    new Promise(r => setTimeout(r, 15000))
                ])

                const type = await adb.getDevice(options.serial).getState()
                push?.send([
                    wireutil.global,
                    wireutil.pack(DeviceIntroductionMessage, {
                        serial: options.serial,

                        // TODO: Verify that @u4/adbkit statuses are correct
                        status: wireutil.toDeviceStatus(type as keyof typeof DEVICE_STATUS_MAP),
                        provider: ProviderMessage.create({
                            channel: solo.channel,
                            name: `standalone-${options.serial}`
                        })
                    })
                ])

                await waitRegister
                router.removeListener(DeviceRegisteredMessage, listener!)
                listener = null
            }

            return syrup.serial()
                .dependency(trackModuleReadyness('heartbeat', heartbeat))
                .dependency(trackModuleReadyness('stream', stream))
                .dependency(trackModuleReadyness('capture', capture))
                .dependency(trackModuleReadyness('service', service))
                .dependency(trackModuleReadyness('shell', shell))
                .dependency(trackModuleReadyness('touch', touch))
                .dependency(trackModuleReadyness('group', group))
                .dependency(trackModuleReadyness('vnc', vnc))
                .dependency(trackModuleReadyness('browser', browser))
                .dependency(trackModuleReadyness('store', store))
                .dependency(trackModuleReadyness('airplane', airplane))
                .dependency(trackModuleReadyness('clipboard', clipboard))
                .dependency(trackModuleReadyness('logcat', logcat))
                .dependency(trackModuleReadyness('mute', mute))
                .dependency(trackModuleReadyness('install', install))
                .dependency(trackModuleReadyness('forward', forward))
                .dependency(trackModuleReadyness('cleanup', cleanup))
                .dependency(trackModuleReadyness('reboot', reboot))
                .dependency(trackModuleReadyness('connect', connect))
                .dependency(trackModuleReadyness('account', account))
                .dependency(trackModuleReadyness('ringer', ringer))
                .dependency(trackModuleReadyness('wifi', wifi))
                .dependency(trackModuleReadyness('bluetooth', bluetooth))
                .dependency(trackModuleReadyness('sd', sd))
                .dependency(trackModuleReadyness('filesystem', filesystem))
                .dependency(trackModuleReadyness('mobileService', mobileService))
                .dependency(trackModuleReadyness('remotedebug', remotedebug))
                .define((options, heartbeat, stream, capture, service, shell, touch, group, vnc) => {
                    if (options.needVnc) {
                        vnc.start()
                    }

                    if (process.send) {
                        // Only if we have a parent process
                        process.send('ready')
                    }
                    log.info('Fully operational')
                    return solo.poke()
                })
                .consume(options)
        })
        .consume(options)
        .catch((err) => {
            if (err.stack.includes('no service started')) {
                return lifecycle.graceful(err.stack)
            }
            lifecycle.fatal(`Setup had an error ${err.stack}`)
        })
})
