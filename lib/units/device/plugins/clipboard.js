import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wireutil from '../../../wire/util.js'
import router from '../../base-device/support/router.js'
import transport from '../../base-device/support/transport.js'
import service from './service.js'
import {CopyMessage, PasteMessage} from '../../../wire/wire.js'
export default syrup.serial()
    .dependency(router)
    .dependency(transport)
    .dependency(service)
    .define(function(options, router, transport, service) {
        var log = logger.createLogger('device:plugins:clipboard')
        router.on(PasteMessage, function(channel, message) {
            log.info('Pasting "%s" to clipboard', message.text)
            var reply = wireutil.reply(options.serial)
            service.paste(message.text)
                .then(function() {
                    transport.send([
                        channel,
                        reply.okay()
                    ])
                })
                .catch(function(err) {
                    log.error('Paste failed', err.stack)
                    transport.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
        router.on(CopyMessage, function(channel) {
            log.info('Copying clipboard contents')
            var reply = wireutil.reply(options.serial)
            service.copy()
                .then(function(content) {
                    transport.send([
                        channel,
                        reply.okay(content)
                    ])
                })
                .catch(function(err) {
                    log.error('Copy failed', err.stack)
                    transport.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
    })
