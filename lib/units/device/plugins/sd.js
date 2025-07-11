import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import service from './service.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
export default syrup.serial()
    .dependency(service)
    .dependency(router)
    .dependency(push)
    .define(function(options, service, router, push) {
        var log = logger.createLogger('device:plugins:sd')
        router.on(wire.SdStatusMessage, function(channel, message) {
            var reply = wireutil.reply(options.serial)
            log.info('Getting SD card status')
            service.getSdStatus(message)
                .timeout(30000)
                .then(function(mounted) {
                    push.send([
                        channel,
                        reply.okay(mounted ? 'sd_mounted' : 'sd_unmounted')
                    ])
                })
                .catch(function(err) {
                    log.error('Getting SD card Status', err.stack)
                    push.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
    })
