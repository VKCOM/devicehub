import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import service from './service.js'
export default syrup.serial()
    .dependency(router)
    .dependency(push)
    .dependency(service)
    .define(function(options, router, push, service) {
        var log = logger.createLogger('device:plugins:clipboard')
        router.on(wire.PasteMessage, function(channel, message) {
            log.info('Pasting "%s" to clipboard', message.text)
            var reply = wireutil.reply(options.serial)
            service.paste(message.text)
                .then(function() {
                    push.send([
                        channel,
                        reply.okay()
                    ])
                })
                .catch(function(err) {
                    log.error('Paste failed', err.stack)
                    push.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
        router.on(wire.CopyMessage, function(channel) {
            log.info('Copying clipboard contents')
            var reply = wireutil.reply(options.serial)
            service.copy()
                .then(function(content) {
                    push.send([
                        channel,
                        reply.okay(content)
                    ])
                })
                .catch(function(err) {
                    log.error('Copy failed', err.stack)
                    push.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
    })
