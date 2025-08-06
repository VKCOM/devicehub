import syrup from '@devicefarmer/stf-syrup'
import logger from '../../util/logger.js'
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
import {trackModuleReadyness} from './readyness.js'
export default (function(options) {
    let log = logger.createLogger('device')
    return syrup.serial()
        // We want to send logs before anything else starts happening
        .dependency(logger$0)
        .define(function(options) {
            const log = logger.createLogger('device')
            log.info('Preparing device')
            return syrup.serial()
                .dependency(trackModuleReadyness('heartbeat', heartbeat))
                .dependency(trackModuleReadyness('solo', solo))
                .dependency(trackModuleReadyness('stream', stream))
                .dependency(trackModuleReadyness('capture', capture))
                .dependency(trackModuleReadyness('service', service))
                .dependency(trackModuleReadyness('browser', browser))
                .dependency(trackModuleReadyness('store', store))
                .dependency(trackModuleReadyness('airplane', airplane))
                .dependency(trackModuleReadyness('clipboard', clipboard))
                .dependency(trackModuleReadyness('logcat', logcat))
                .dependency(trackModuleReadyness('mute', mute))
                .dependency(trackModuleReadyness('shell', shell))
                .dependency(trackModuleReadyness('touch', touch))
                .dependency(trackModuleReadyness('install', install))
                .dependency(trackModuleReadyness('forward', forward))
                .dependency(trackModuleReadyness('group', group))
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
                .define(function(options, heartbeat, solo) {
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
        .catch(function(err) {
            log.fatal('Setup had an error', err.stack)
            if (err.stack.includes('no service started')) {
                return lifecycle.graceful(err.stack)
            }
            lifecycle.fatal()
        })
})
