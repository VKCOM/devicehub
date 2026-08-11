import syrup from '@devicefarmer/stf-syrup'
import lifecycle from '../../../util/lifecycle.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import transport from '../../base-device/support/transport.js'

export default syrup.serial()
    .dependency(transport)
    .define((options, transport) => {
        function beat() {
            transport.send([
                wireutil.global,
                wireutil.envelope(new wire.DeviceHeartbeatMessage(
                    options.serial
                ))
            ])
        }

        let timer = setInterval(beat, options.heartbeatInterval)

        lifecycle.observe(() => clearInterval(timer))
    })
