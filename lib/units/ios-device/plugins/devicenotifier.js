import syrup from '@devicefarmer/stf-syrup'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import logger from '../../../util/logger.js'
import lifecycle from '../../../util/lifecycle.js'
import push from '../../base-device/support/push.js'
import group from './group.js'
export default syrup.serial()
    .dependency(push)
    .dependency(group)
    .define(function(options, push, group) {
        const log = logger.createLogger('device:plugins:notifier')
        const notifier = {}
        notifier.setDeviceTemporaryUnavailable = function(err) {
            group.get()
                .then((currentGroup) => {
                    push.send([
                        currentGroup.group,
                        wireutil.envelope(new wire.TemporarilyUnavailableMessage(options.serial))
                    ])
                })
                .catch(err => {
                    log.error('Cannot set device temporary unavailable', err)
                })
        }
        notifier.setDeviceAbsent = function(err) {
            if (err.statusCode) {
                push.send([
                    wireutil.global,
                    wireutil.envelope(new wire.DeviceStatusMessage(options.serial, 1))
                ])
            }
            else {
                push.send([
                    wireutil.global,
                    wireutil.envelope(new wire.DeviceAbsentMessage(options.serial))
                ])
            }
            lifecycle.graceful(err)
        }
        return notifier
    })
