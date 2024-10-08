import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import adb from '../support/adb.js'
export default syrup.serial()
    .dependency(router)
    .dependency(push)
    .dependency(adb)
    .define(function(options, router, push, adb) {
    var log = logger.createLogger('device:plugins:store')
    router.on(wire.StoreOpenMessage, function(channel) {
        log.info('Opening Play Store')
        var reply = wireutil.reply(options.serial)
        adb.getDevice(options.serial).startActivity({
            action: 'android.intent.action.MAIN'
            , component: 'com.android.vending/.AssetBrowserActivity' // FLAG_ACTIVITY_RESET_TASK_IF_NEEDED
            // FLAG_ACTIVITY_BROUGHT_TO_FRONT
            // FLAG_ACTIVITY_NEW_TASK

            , flags: 0x10600000
        })
            .then(function() {
            push.send([
                channel
                , reply.okay()
            ])
        })
            .catch(function(err) {
            log.error('Play Store could not be opened', err.stack)
            push.send([
                channel
                , reply.fail()
            ])
        })
    })
})
