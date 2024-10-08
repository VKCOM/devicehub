import syrup from '@devicefarmer/stf-syrup'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import wdaClient from './wda/WdaClient.js'
export default syrup.serial()
    .dependency(router)
    .dependency(push)
    .dependency(wdaClient)
    .define(function(options, router, push, wdaClient) {
    router.on(wire.CopyMessage, function(channel) {
        const reply = wireutil.reply(options.serial)
        wdaClient.getClipBoard()
            .then(clipboard => {
            push.send([
                channel
                , reply.okay(clipboard)
            ])
        })
            .catch(err => {
            push.send([
                channel
                , reply.fail('')
            ])
        })
    })
})
