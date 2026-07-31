import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import service from './service.js'
import router from '../../base-device/support/router.js'
import transport from '../../base-device/support/transport.js'
import {RingerGetMessage, RingerSetMessage} from '../../../wire/wire.js'
export default syrup.serial()
    .dependency(service)
    .dependency(router)
    .dependency(transport)
    .define(function(options, service, router, transport) {
        var log = logger.createLogger('device:plugins:ringer')
        router.on(RingerSetMessage, function(channel, message) {
            var reply = wireutil.reply(options.serial)
            log.info('Setting ringer mode to mode "%s"', message.mode)
            service.setRingerMode(message.mode)
                .timeout(30000)
                .then(function() {
                    transport.send([
                        channel,
                        reply.okay()
                    ])
                })
                .catch(function(err) {
                    log.error('Setting ringer mode failed', err.stack)
                    transport.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
        router.on(RingerGetMessage, function(channel) {
            var reply = wireutil.reply(options.serial)
            log.info('Getting ringer mode')
            service.getRingerMode()
                .timeout(30000)
                .then(function(mode) {
                    transport.send([
                        channel,
                        reply.okay('success', mode)
                    ])
                })
                .catch(function(err) {
                    log.error('Getting ringer mode failed', err.stack)
                    transport.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
    })
