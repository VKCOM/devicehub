import syrup from '@devicefarmer/stf-syrup'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import logger from '../../../util/logger.js'
import lifecycle from '../../../util/lifecycle.js'
import transport from '../../base-device/support/transport.js'
import group from './group.js'

export default syrup.serial()
    .dependency(transport)
    .dependency(group)
    .define(function(options, transport, group) {
        const log = logger.createLogger('device:plugins:notifier')
        const notifier = {}

        notifier.setDeviceTemporaryUnavailable = function(err) {
            group.get()
                .then((currentGroup) => {
                    transport.send([
                        currentGroup.group,
                        wireutil.envelope(new wire.TemporarilyUnavailableMessage(
                            options.serial
                        ))
                    ])
                })
                .catch(err => {
                    log.error('Cannot set device temporary unavailable', err)
                })
        }

        notifier.setDeviceAbsent = function(err) {
            if (err.statusCode) {
                transport.send([
                    wireutil.global,
                    wireutil.envelope(new wire.DeviceStatusMessage(
                        options.serial,
                        1
                    ))
                ])
            }
            else {
                transport.send([
                    wireutil.global,
                    wireutil.envelope(new wire.DeviceAbsentMessage(
                        options.serial
                    ))
                ])
            }

            lifecycle.graceful(err)
        }

        return notifier
    })
