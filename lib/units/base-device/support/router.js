import syrup from '@devicefarmer/stf-syrup'
import wirerouter from '../../../wire/router.js'
import sub from './sub.js'
import channels from './channels.js'
export default syrup.serial()
    .dependency(sub)
    .dependency(channels)
    .define((options, sub, channels) => {
        let router = wirerouter()
        sub.on('message', router.handler())
        // Special case, we're hooking into a message that's not actually routed.
        router.on({$code: 'message'}, channel => {
            channels.keepalive(channel)
        })
        return router
    })
