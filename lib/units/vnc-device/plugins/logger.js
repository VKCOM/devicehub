import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import transport from '../../base-device/support/transport.js'


export default syrup.serial()
    .dependency(transport)
    .define((options, transport) => {
    // Forward all logs
        logger.on('entry', entry => {
            transport.send([
                wireutil.global,
                wireutil.envelope(new wire.DeviceLogMessage(
                    options.serial
                    , entry.timestamp / 1000
                    , entry.priority
                    , entry.tag
                    , entry.pid
                    , entry.message
                    , entry.identifier
                ))
            ])
        })

        return logger
    })
