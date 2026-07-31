import syrup from '@devicefarmer/stf-syrup'
import lifecycle from '../../../util/lifecycle.js'
import wireutil from '../../../wire/util.js'
import transport from '../support/transport.js'
import EventEmitter from 'events'
import {DeviceHeartbeatMessage} from "../../../wire/wire.js"
export default syrup.serial()
    .dependency(transport)
    .define((options, transport) => {
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
                transport.send(payload)
                beat()
                emitter.emit('beat')
            }, options.heartbeatInterval)
        )

        beat()
        lifecycle.observe(() => clearTimeout(timer))
        return emitter
    })
