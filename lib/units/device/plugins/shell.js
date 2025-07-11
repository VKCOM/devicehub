import Promise from 'bluebird'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import adb from '../support/adb.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import sub from '../../base-device/support/sub.js'
export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(push)
    .dependency(sub)
    .define(function(options, adb, router, push, sub) {
        var log = logger.createLogger('device:plugins:shell')
        router.on(wire.ShellCommandMessage, async function(channel, message) {
            var reply = wireutil.reply(options.serial)
            log.info('Running shell command "%s"', message.command)
            const stream = await adb.getDevice(options.serial).shell(message.command)
            var resolver = Promise.defer()
            var timer
            function forceStop() {
                stream.end()
            }
            function keepAliveListener(channel, message) {
                clearTimeout(timer)
                timer = setTimeout(forceStop, message.timeout)
            }
            function readableListener() {
                let chunk
                while ((chunk = stream.read())) {
                    push.send([
                        channel,
                        reply.progress(chunk)
                    ])
                }
            }
            function endListener() {
                push.send([
                    channel,
                    reply.okay(null)
                ])
                resolver.resolve()
            }
            function errorListener(err) {
                resolver.reject(err)
            }
            try {
                stream.setEncoding('utf8')
                stream.on('readable', readableListener)
                stream.on('end', endListener)
                stream.on('error', errorListener)
                sub.subscribe(channel)
                router.on(wire.ShellKeepAliveMessage, keepAliveListener)
                timer = setTimeout(forceStop, message.timeout)
                return resolver.promise.finally(function() {
                    stream.removeListener('readable', readableListener)
                    stream.removeListener('end', endListener)
                    stream.removeListener('error', errorListener)
                    sub.unsubscribe(channel)
                    router.removeListener(wire.ShellKeepAliveMessage, keepAliveListener)
                    clearTimeout(timer)
                })
            }
            catch(err) {
                log.error('Shell command "%s" failed', message.command, err.stack)
                push.send([
                    channel,
                    reply.fail(err.message)
                ])
            }
        })
    })
