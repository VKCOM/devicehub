import syrup from '@devicefarmer/stf-syrup'
import wireutil from '../../../wire/util.js'
import router from '../../base-device/support/router.js'
import transport from '../../base-device/support/transport.js'
import wdaClient from './wda/client.js'
import {CopyMessage} from '../../../wire/wire.js'

export default syrup.serial()
    .dependency(router)
    .dependency(transport)
    .dependency(wdaClient)
    .define((options, router, transport, wdaClient) => {
        router.on(CopyMessage, async(channel) => {
            const reply = wireutil.reply(options.serial)
            const clipboard = await wdaClient.getClipBoard()
            transport.send([
                channel,
                reply.okay(clipboard)
            ])
        })
    })
