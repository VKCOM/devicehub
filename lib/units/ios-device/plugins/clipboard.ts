import syrup from '@devicefarmer/stf-syrup'
import wireutil from '../../../wire/util.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import wdaClient from './wda/client.js'
import {CopyMessage} from '../../../wire/wire.js'

export default syrup.serial()
    .dependency(router)
    .dependency(push)
    .dependency(wdaClient)
    .define((options, router, push, wdaClient) => {
        router.on(CopyMessage, async(channel) => {
            const reply = wireutil.reply(options.serial)
            const clipboard = await wdaClient.getClipBoard()
            push.send([
                channel,
                reply.okay(clipboard)
            ])
        })
    })
