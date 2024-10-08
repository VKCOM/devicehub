import syrup from '@devicefarmer/stf-syrup'
import path from 'path'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import adb from '../support/adb.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import storage from '../support/storage.js'
export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(push)
    .dependency(storage)
    .define(function(options, adb, router, push, storage) {
    var log = logger.createLogger('device:plugins:filesystem')
    var plugin = Object.create(null)
    plugin.retrieve = function(file) {
        log.info('Retrieving file "%s"', file)
        return adb.getDevice(options.serial).stat(file)
            .then(function(stats) {
            return adb.getDevice(options.serial).pull(file)
                .then(function(transfer) {
                // We may have add new storage plugins for various file types
                // in the future, and add proper detection for the mimetype.
                // But for now, let's just use application/octet-stream for
                // everything like it's 2001.
                return storage.store('blob', transfer, {
                    filename: path.basename(file)
                    , contentType: 'application/octet-stream'
                    , knownLength: stats.size
                })
            })
        })
    }
    router.on(wire.FileSystemGetMessage, function(channel, message) {
        var reply = wireutil.reply(options.serial)
        plugin.retrieve(message.file)
            .then(function(file) {
            push.send([
                channel
                , reply.okay('success', file)
            ])
        })
            .catch(function(err) {
            log.warn('Unable to retrieve "%s"', message.file, err.stack)
            push.send([
                channel
                , reply.fail(err.message)
            ])
        })
    })
    router.on(wire.FileSystemListMessage, function(channel, message) {
        var reply = wireutil.reply(options.serial)
        adb.getDevice(options.serial).readdir(message.dir)
            .then(function(files) {
            push.send([
                channel
                , reply.okay('success', files)
            ])
        })
            .catch(function(err) {
            log.warn('Unable to list directory "%s"', message.dir, err.stack)
            push.send([
                channel
                , reply.fail(err.message)
            ])
        })
    })
    return plugin
})
