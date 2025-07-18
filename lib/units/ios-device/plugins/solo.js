import crypto from 'crypto'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import Promise from 'bluebird'
import sub from '../../base-device/support/sub.js'
import push from '../../base-device/support/push.js'
export default syrup.serial()
    .dependency(sub)
    .dependency(push)
    .define((options, sub, push) => {
        const log = logger.createLogger('device:plugins:solo')
        // The channel should keep the same value between restarts, so that
        // having the client side up to date all the time is not horribly painful.
        let makeChannelId = () => {
            let hash = crypto.createHash('sha1')
            hash.update(options.serial)
            return hash.digest('base64')
        }
        let channel = makeChannelId()
        log.info('Subscribing to permanent channel "%s"', channel)
        sub.subscribe(channel)
        return {
            channel: channel,
            poke: () => {
                Promise.delay(5 * 1000)
                    .then(() => {
                        push.send([
                            wireutil.global,
                            wireutil.envelope(new wire.DeviceReadyMessage(options.serial, channel))
                        ])
                    })
            }
        }
    })
