import syrup from '@devicefarmer/stf-syrup'
import logger from '../../util/logger.js'
import lifecycle from '../../util/lifecycle.js'
import logger$0 from './plugins/logger.js'
import heartbeat from './plugins/heartbeat.js'
import solo from './plugins/solo.js'
import info from './plugins/info/index.js'
import wda from './plugins/wda.js'
import push from '../base-device/support/push.js'
import sub from '../base-device/support/sub.js'
import group from './plugins/group.js'
import storage from './support/storage.js'
import devicelog from './plugins/devicelog.js'
import stream from './plugins/screen/stream.js'
import install from './plugins/install.js'
import reboot from './plugins/reboot.js'
import clipboard from './plugins/clipboard.js'
import remotedebug from './plugins/remotedebug.js'
export default (function(options) {
    // Show serial number in logs
    logger.setGlobalIdentifier(options.serial)
    return syrup.serial()
        .dependency(logger$0)
        .define(function(options) {
        const log = logger.createLogger('ios-device')
        log.info('Preparing device options: ', options)
        return syrup.serial()
            .dependency(heartbeat)
            .dependency(solo)
            .dependency(info)
            .dependency(wda)
            .dependency(push)
            .dependency(sub)
            .dependency(group)
            .dependency(storage)
            .dependency(devicelog)
            .dependency(stream)
            .dependency(install)
            .dependency(reboot)
            .dependency(clipboard)
            .dependency(remotedebug)
            .define(function(options, heartbeat, solo, info, wda) {
            if (process.send) {
                process.send('ready')
            }
            try {
                wda.connect()
                solo.poke()
            }
            catch (err) {
                log.error('err :', err)
            }
        })
            .consume(options)
    })
        .consume(options)
        .catch((err) => {
        lifecycle.fatal(err)
    })
})
