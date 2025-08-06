import syrup from '@devicefarmer/stf-syrup'
import lifecycle from '../../../util/lifecycle.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import push from '../support/push.js'
import EventEmitter from 'events'
export default syrup.serial()
    .dependency(push)
    .define((options, push) => {
        const emitter = new EventEmitter()
        let timer
        const beat = () => {
            timer = setTimeout(() => {
                beat()
                push.send([
                    wireutil.global,
                    wireutil.envelope(new wire.DeviceHeartbeatMessage(options.serial))
                ])
                emitter.emit('beat')
            }, options.heartbeatInterval)
        }
        beat()
        lifecycle.observe(() => clearTimeout(timer))
        return emitter
    })
