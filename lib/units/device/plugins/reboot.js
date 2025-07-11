import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import adb from '../support/adb.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(push)
    .define(function(options, adb, router, push) {
        const log = logger.createLogger('device:plugins:reboot')
        router.on(wire.RebootMessage, function(channel) {
            let reply = wireutil.reply(options.serial)
            log.important('Rebooting')
            adb.getDevice(options.serial).reboot()
                .then(function() {
                    push.send([
                        channel,
                        reply.okay()
                    ])
                })
                .catch(function(err) {
                    log.error('Reboot failed', err.stack)
                    push.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
    })
