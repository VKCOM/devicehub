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
    var log = logger.createLogger('device:plugins:wifi')
    router.on(wire.WifiSetEnabledMessage, function(channel, message) {
        var reply = wireutil.reply(options.serial)
        log.info('Setting Wifi "%s"', message.enabled)
        service.setWifiEnabled(message.enabled)
            .timeout(30000)
            .then(function() {
            push.send([
                channel
                , reply.okay()
            ])
        })
            .catch(function(err) {
            log.error('Setting Wifi enabled failed', err.stack)
            push.send([
                channel
                , reply.fail(err.message)
            ])
        })
    })
    router.on(wire.WifiGetStatusMessage, function(channel) {
        var reply = wireutil.reply(options.serial)
        log.info('Getting Wifi status')
        service.getWifiStatus()
            .timeout(30000)
            .then(function(enabled) {
            push.send([
                channel
                , reply.okay(enabled ? 'wifi_enabled' : 'wifi_disabled')
            ])
        })
            .catch(function(err) {
            log.error('Getting Wifi status failed', err.stack)
            push.send([
                channel
                , reply.fail(err.message)
            ])
        })
    })
})
