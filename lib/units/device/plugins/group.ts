import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import {DeviceGetIsInOrigin} from '../../../wire/wire.js'
import wireutil from '../../../wire/util.js'
import * as grouputil from '../../../util/grouputil.js'
import solo from './solo.js'
import identity from './util/identity.js'
import service from './service.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import sub from '../../base-device/support/sub.js'
import channels from '../../base-device/support/channels.js'
import group from '../../base-device/plugins/group.js'
import {runTransactionDev} from '../../../wire/transmanager.js'

export default syrup.serial()
    .dependency(solo)
    .dependency(identity)
    .dependency(service)
    .dependency(router)
    .dependency(push)
    .dependency(sub)
    .dependency(channels)
    .dependency(group)
    .define(async(options, solo, ident, /** @type {any} */ service, router, push, sub, channels, group) => {
        const log = logger.createLogger('device:plugins:group')

        group.setCheckBeforeAction(async(message: any) =>
            !message.requirements || grouputil.match(ident, message.requirements)
        )

        group.on('join', () => {
            service.freezeRotation(0)
            service.wake()
            service.acquireWakeLock()
        })

        group.on('leave', async() => {
            try {
                if (options.screenReset) {
                    service.pressKey('home')
                    service.thawRotation()

                    const {isInOrigin} = await runTransactionDev(
                        wireutil.global,
                        DeviceGetIsInOrigin,
                        {serial: options.serial},
                        {sub, push, router}
                    ) as { isInOrigin: boolean }

                    if (isInOrigin) {
                        log.warn('Cleaning device')
                        await Promise.all([
                            service.sendCommand('settings put system screen_brightness_mode 0'),
                            service.sendCommand('settings put system screen_brightness 0'),
                            service.setMasterMute(true),
                            service.sendCommand('input keyevent 26'),
                            service.sendCommand('settings put global http_proxy :0'),
                            service.sendCommand('pm clear com.android.chrome'),
                            service.sendCommand('pm clear com.chrome.beta'),
                            service.sendCommand('pm clear com.sec.android.app.sbrowser'),
                            service.sendCommand('pm uninstall com.vkontakte.android'),
                            service.sendCommand('pm uninstall com.vk.im'),
                            service.sendCommand('pm uninstall com.vk.clips'),
                            service.sendCommand('pm uninstall com.vk.calls'),
                            service.sendCommand('pm uninstall com.vk.admin'),
                            service.sendCommand('pm clear com.mi.globalbrowser'),
                            service.sendCommand('pm clear com.microsoft.emmx'),
                            service.sendCommand('pm clear com.huawei.browser'),
                            service.sendCommand('pm uninstall --user 0 com.samsung.clipboardsaveservice'),
                            service.sendCommand('pm uninstall --user 0 com.samsung.android.clipboarduiservice'),
                            service.sendCommand('rm -rf /sdcard/Downloads'),
                            service.sendCommand('rm -rf /storage/emulated/legacy/Downloads'),
                            service.sendCommand('settings put global always_finish_activities 0'),
                            service.sendCommand('pm enable-user com.google.android.gms'),
                            service.sendCommand('settings put system font_scale 1.0'),
                            service.sendCommand('su'),
                            service.sendCommand('echo "chrome --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'),
                            service.sendCommand('am set-debug-app --persistent com.android.chrome')
                        ])
                    }
                    else {
                        log.warn('Device was not cleared because it in custom group')
                    }
                }
            }
            catch (err: any) {
                log.error('Clear device on group.leave failed: %s', err?.message)
            }
            finally {
                service.releaseWakeLock()
            }
        })

        return group
    })
