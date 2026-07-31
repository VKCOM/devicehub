import crypto from 'crypto'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import lifecycle from '../../../util/lifecycle.js'
import wireutil from '../../../wire/util.js'
import transport from '../../base-device/support/transport.js'
import info from '../plugins/info/index.js'

export default syrup.serial()
    .dependency(transport)
    .dependency(info)
    .define((options, transport, info) => {
        const log = logger.createLogger('device:plugins:solo')

        // The channel should keep the same value between restarts, so that
        // having the client side up to date all the time is not horribly painful.
        let makeChannelId = () => {
            let hash = crypto.createHash('sha1')
            hash.update(options.serial)
            return hash.digest('base64')
        }

        let channel = makeChannelId()

        return {
            channel: channel,
            poke: () => {
                info.manageDeviceInfo()
                    .then(() => {
                        transport.send([
                            wireutil.global,
                            wireutil.envelope(new wire.DeviceReadyMessage(
                                options.serial
                                , channel
                            ))
                        ])
                    })
                    .catch(err => {
                        log.error('catch managerinfo', err)
                        lifecycle.fatal(err)
                    })
            }
        }
    })
