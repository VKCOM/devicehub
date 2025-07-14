import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
import adbkit from '@irdk/adbkit'
import logger from '../../../../util/logger.js'
import wire from '../../../../wire/index.js'
import wireutil from '../../../../wire/util.js'
import adb from '../../support/adb.js'
import router from '../../../base-device/support/router.js'
import push from '../../../base-device/support/push.js'
import storage from '../../../base-device/support/storage.js'
import minicap from '../../resources/minicap.js'
import display from '../util/display.js'
export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(push)
    .dependency(storage)
    .dependency(minicap)
    .dependency(display)
    .define(function(options, adb, router, push, storage, minicap, display) {
        var log = logger.createLogger('device:plugins:screen:capture')
        var plugin = Object.create(null)
        function projectionFormat() {
            return util.format('%dx%d@%dx%d/%d', display.properties.width, display.properties.height, display.properties.width, display.properties.height, display.properties.rotation)
        }
        plugin.capture = function() {
            var file = util.format('/data/local/tmp/minicap_%d.jpg', Date.now())
            return minicap.run('minicap-apk', util.format('-P %s -s >%s', projectionFormat(), file))
                .then(adbkit.Adb.util.readAll)
                .then(function() {
                    return adb.getDevice(options.serial).stat(file)
                })
                .then(function(stats) {
                    if (stats.size === 0) {
                        throw new Error('Empty screenshot; possibly secure screen?')
                    }
                    return adb.getDevice(options.serial).pull(file)
                        .then(function(transfer) {
                            return storage.store('image', transfer, {
                                filename: util.format('%s.jpg', options.serial),
                                contentType: 'image/jpeg',
                                knownLength: stats.size
                            })
                        })
                })
                .finally(function() {
                    return adb.getDevice(options.serial).shell(['rm', '-f', file])
                        .then(adbkit.Adb.util.readAll)
                })
        }
        router.on(wire.ScreenCaptureMessage, function(channel) {
            var reply = wireutil.reply(options.serial)
            plugin.capture()
                .then(function(file) {
                    push.send([
                        channel,
                        reply.okay('success', file)
                    ])
                })
                .catch(function(err) {
                    log.error('Screen capture failed', err.stack)
                    push.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
        return plugin
    })
