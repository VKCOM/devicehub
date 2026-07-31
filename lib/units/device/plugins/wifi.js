import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import service from './service.js'
import router from '../../base-device/support/router.js'
import transport from '../../base-device/support/transport.js'
import {WifiGetStatusMessage, WifiSetEnabledMessage} from '../../../wire/wire.js'
export default syrup.serial()
    .dependency(service)
    .dependency(router)
    .dependency(transport)
    .define(function(options, service, router, transport) {
        var log = logger.createLogger('device:plugins:wifi')
        router.on(WifiSetEnabledMessage, function(channel, message) {
            var reply = wireutil.reply(options.serial)
            log.info('Setting Wifi "%s"', message.enabled)
            service.setWifiEnabled(message.enabled)
                .timeout(30000)
                .then(function() {
                    transport.send([
                        channel,
                        reply.okay()
                    ])
                })
                .catch(function(err) {
                    log.error('Setting Wifi enabled failed', err.stack)
                    transport.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
        router.on(WifiGetStatusMessage, function(channel) {
            var reply = wireutil.reply(options.serial)
            log.info('Getting Wifi status')
            service.getWifiStatus()
                .timeout(30000)
                .then(function(enabled) {
                    transport.send([
                        channel,
                        reply.okay(enabled ? 'wifi_enabled' : 'wifi_disabled')
                    ])
                })
                .catch(function(err) {
                    log.error('Getting Wifi status failed', err.stack)
                    transport.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
    })
