import crypto from 'crypto'
import syrup from '@devicefarmer/stf-syrup'
import wireutil from '../../../wire/util.js'
import transport from '../support/transport.js'
import {DeviceReadyMessage} from "../../../wire/wire.js"

export default syrup.serial()
    .dependency(transport)
    .define((options, transport) => {
        // The channel should keep the same value between restarts, so that
        // having the client side up to date all the time is not horribly painful.
        const makeChannelId = () => {
            const hash = crypto.createHash('sha1')
            hash.update(options.serial)
            return hash.digest('base64')
        }

        // The channel identifies this device to the client side. Routing is by
        // deviceKey now, so there is no channel subscription — the id is still
        // published in DeviceReadyMessage for the client to address replies.
        const channel = makeChannelId()

        return {
            channel: channel,
            poke: () => {
                transport.send([
                    wireutil.global,
                    wireutil.pack(DeviceReadyMessage, {
                        serial: options.serial,
                        channel
                    })
                ])
            }
        }
    })
