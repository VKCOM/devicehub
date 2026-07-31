import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import service from './service.js'
import router from '../../base-device/support/router.js'
import transport from '../../base-device/support/transport.js'
import {SdStatusMessage} from '../../../wire/wire.js'
export default syrup.serial()
    .dependency(service)
    .dependency(router)
    .dependency(transport)
    .define(function(options, service, router, transport) {
        var log = logger.createLogger('device:plugins:sd')
        router.on(SdStatusMessage, function(channel, message) {
            var reply = wireutil.reply(options.serial)
            log.info('Getting SD card status')
            service.getSdStatus(message)
                .timeout(30000)
                .then(function(mounted) {
                    transport.send([
                        channel,
                        reply.okay(mounted ? 'sd_mounted' : 'sd_unmounted')
                    ])
                })
                .catch(function(err) {
                    log.error('Getting SD card Status', err.stack)
                    transport.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
    })
