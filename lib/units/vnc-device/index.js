import syrup from '@devicefarmer/stf-syrup'
import logger from '../../util/logger.js'
import lifecycle from '../../util/lifecycle.js'
import heartbeat from '../base-device/plugins/heartbeat.js'
import solo from './plugins/solo.js'
import info from './plugins/info/index.js'
import push from '../base-device/support/push.js'
import sub from '../base-device/support/sub.js'
import group from './plugins/group.js'
import stream from './plugins/screen/stream.js'
import plogger from './plugins/logger.js'


export default function(options) {
    // Show serial number in logs
    logger.setGlobalIdentifier(options.serial)

    return syrup.serial()
        .dependency(plogger)
        .define(function(options) {
            const log = logger.createLogger('vnc-device')
            log.info('Preparing device options: ', options)

            return syrup.serial()
                .dependency(heartbeat)
                .dependency(solo)
                .dependency(info)
                .dependency(push)
                .dependency(sub)
                .dependency(group)
                .dependency(stream)
                .define(function(options, heartbeat, solo) {
                    if (process.send) {
                        process.send('ready')
                    }
                    try {
                        solo.poke()
                    }
                    catch(err) {
                        log.error('err :', err)
                    }
                })
                .consume(options)
        })
        .consume(options)
        .catch((err) => {
            lifecycle.fatal(err)
        })
}
