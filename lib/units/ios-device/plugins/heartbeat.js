import syrup from '@devicefarmer/stf-syrup'
import lifecycle from '../../../util/lifecycle.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import push from '../../base-device/support/push.js'
export default syrup.serial()
    .dependency(push)
    .define((options, push) => {
    function beat() {
        push.send([
            wireutil.global
            , wireutil.envelope(new wire.DeviceHeartbeatMessage(options.serial))
        ])
    }
    let timer = setInterval(beat, options.heartbeatInterval)
    lifecycle.observe(() => clearInterval(timer))
})
