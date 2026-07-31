import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wireutil from '../../../wire/util.js'
import service from './service.js'
import router from '../../base-device/support/router.js'
import transport from '../../base-device/support/transport.js'
import {BluetoothCleanBondedMessage, BluetoothGetStatusMessage, BluetoothSetEnabledMessage} from '../../../wire/wire.js'
export default syrup.serial()
    .dependency(service)
    .dependency(router)
    .dependency(transport)
    .define(function(options, service, router, transport) {
        var log = logger.createLogger('device:plugins:bluetooth')
        router.on(BluetoothSetEnabledMessage, function(channel, message) {
            var reply = wireutil.reply(options.serial)
            log.info('Setting Bluetooth "%s"', message.enabled)
            service.setBluetoothEnabled(message.enabled)
                .timeout(30000)
                .then(function() {
                    transport.send([
                        channel,
                        reply.okay()
                    ])
                })
                .catch(function(err) {
                    log.error('Setting Bluetooth enabled failed %s', err.message)
                    transport.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
        router.on(BluetoothGetStatusMessage, function(channel) {
            var reply = wireutil.reply(options.serial)
            log.info('Getting Bluetooth status')
            service.getBluetoothStatus()
                .then(function(enabled) {
                    transport.send([
                        channel,
                        reply.okay(enabled ? 'bluetooth_enabled' : 'bluetooth_disabled')
                    ])
                })
                .catch(function(err) {
                    log.error('Getting Bluetooth status failed %s', err.message)
                    transport.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
        router.on(BluetoothCleanBondedMessage, function(channel) {
            var reply = wireutil.reply(options.serial)
            log.info('Clean bonded Bluetooth devices')
            service.cleanupBondedBluetoothDevices()
                .timeout(30000)
                .then(function() {
                    transport.send([
                        channel,
                        reply.okay()
                    ])
                })
                .catch(function(err) {
                    log.error('Cleaning Bluetooth bonded devices failed %s', err.message)
                    transport.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
    })
