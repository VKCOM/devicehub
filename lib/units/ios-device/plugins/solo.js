import crypto from 'crypto'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import lifecycle from '../../../util/lifecycle.js'
import wireutil from '../../../wire/util.js'
import Promise from 'bluebird'
import sub from '../../base-device/support/sub.js'
import push from '../../base-device/support/push.js'
import info from './info/index.js'
export default syrup.serial()
    .dependency(sub)
    .dependency(push)
    .dependency(info)
    .define((options, sub, push, info) => {
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
            channel: channel
            , poke: () => {
                info.manageDeviceInfo()
                    .then(() => {
                        // wait until device will be registered
                        Promise.delay(3 * 1000)
                            .then(() => {
                                push.send([
                                    wireutil.global
                                    , wireutil.envelope(new wire.DeviceReadyMessage(options.serial, channel))
                                ])
                            })
                    })
                    .catch(err => {
                        log.error('catch managerinfo', err)
                        lifecycle.fatal(err)
                    })
            }
        }
    })
