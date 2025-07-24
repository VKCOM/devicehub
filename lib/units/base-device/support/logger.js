import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import push from '../../base-device/support/push.js'
export default syrup.serial()
    .dependency(push)
    .define((options, push) => {
        // Show serial number in logs
        logger.setGlobalIdentifier(options.serial)

        // Forward all logs
        logger.on('entry', entry => {
            push.send([
                wireutil.global,
                wireutil.envelope(new wire.DeviceLogMessage(options.serial, entry.timestamp / 1000, entry.priority, entry.tag, entry.pid, entry.message, entry.identifier))
            ])
        })
        return logger
    })
