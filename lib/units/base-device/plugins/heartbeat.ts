import syrup from '@devicefarmer/stf-syrup'
import lifecycle from '../../../util/lifecycle.js'
import wireutil from '../../../wire/util.js'
import push from '../support/push.js'
import EventEmitter from 'events'
import {DeviceHeartbeatMessage} from "../../../wire/wire.js"
export default syrup.serial()
    .dependency(push)
    .define((options, push) => {
        const emitter = new EventEmitter<{
            beat: []
        }>()
        const payload = [
            wireutil.global,
            wireutil.pack(DeviceHeartbeatMessage, { serial: options.serial })
        ]

        let timer: NodeJS.Timeout
        const beat = () => (
            timer = setTimeout(() => {
                push.send(payload)
                beat()
                emitter.emit('beat')
            }, options.heartbeatInterval)
        )

        beat()
        lifecycle.observe(() => clearTimeout(timer))
        return emitter
    })
