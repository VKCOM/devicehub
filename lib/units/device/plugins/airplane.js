import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import devutil from '../../../util/devutil.js'
export default syrup.serial()
    .dependency(devutil)
    .dependency(router)
    .dependency(push)
    .define(function(options, devutil, router, push) {
        var log = logger.createLogger('device:plugins:airplane')
        router.on(wire.AirplaneSetMessage, async function(channel, message) {
            const reply = wireutil.reply(options.serial)
            const enabled = message.enabled
            log.info('Setting airplane mode to', enabled)
            try {
                await devutil.executeShellCommand(`cmd connectivity airplane-mode ${enabled ? 'enable' : 'disable'}`)
            }
            catch (err) {
                push.send([
                    channel,
                    reply.fail(err + '')
                ])
                return
            }
            push.send([
                channel,
                reply.okay()
            ])
        })
    })
