import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wireutil from '../../../wire/util.js'
import router from '../../base-device/support/router.js'
import transport from '../../base-device/support/transport.js'
import devutil from '../../../util/devutil.js'
import {AirplaneSetMessage} from '../../../wire/wire.js'
export default syrup.serial()
    .dependency(devutil)
    .dependency(router)
    .dependency(transport)
    .define(function(options, devutil, router, transport) {
        var log = logger.createLogger('device:plugins:airplane')
        router.on(AirplaneSetMessage, async function(channel, message) {
            const reply = wireutil.reply(options.serial)
            const enabled = message.enabled
            log.info('Setting airplane mode to %s', enabled)
            try {
                await devutil.executeShellCommand(`cmd connectivity airplane-mode ${enabled ? 'enable' : 'disable'}`)
            }
            catch (err) {
                transport.send([
                    channel,
                    reply.fail(err + '')
                ])
                return
            }
            transport.send([
                channel,
                reply.okay()
            ])
        })
    })
