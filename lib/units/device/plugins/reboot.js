import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import adb from '../support/adb.js'
import router from '../../base-device/support/router.js'
import transport from '../../base-device/support/transport.js'
import {RebootMessage} from '../../../wire/wire.js'
export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(transport)
    .define(function(options, adb, router, transport) {
        const log = logger.createLogger('device:plugins:reboot')
        router.on(RebootMessage, function(channel) {
            let reply = wireutil.reply(options.serial)
            log.important('Rebooting')
            adb.getDevice(options.serial).reboot()
                .then(function() {
                    transport.send([
                        channel,
                        reply.okay()
                    ])
                })
                .catch(function(err) {
                    log.error('Reboot failed', err.stack)
                    transport.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
    })
