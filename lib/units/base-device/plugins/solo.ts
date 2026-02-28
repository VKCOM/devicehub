import crypto from 'crypto'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wireutil from '../../../wire/util.js'
import sub from '../support/sub.js'
import push from '../support/push.js'
import {DeviceReadyMessage} from "../../../wire/wire.js"

export default syrup.serial()
    .dependency(sub)
    .dependency(push)
    .define((options, sub, push) => {
        const log = logger.createLogger('base-device:plugins:solo')

        // The channel should keep the same value between restarts, so that
        // having the client side up to date all the time is not horribly painful.
        const makeChannelId = () => {
            const hash = crypto.createHash('sha1')
            hash.update(options.serial)
            return hash.digest('base64')
        }

        const channel = makeChannelId()

        log.info('Subscribing to permanent channel "%s"', channel)
        sub.subscribe(channel)

        return {
            channel: channel,
            poke: () => {
                push.send([
                    wireutil.global,
                    wireutil.pack(DeviceReadyMessage, {
                        serial: options.serial,
                        channel
                    })
                ])
            }
        }
    })
