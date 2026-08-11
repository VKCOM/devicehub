import Promise from 'bluebird'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import adb from '../support/adb.js'
import router from '../../base-device/support/router.js'
import transport from '../../base-device/support/transport.js'
import {ShellCommandMessage, ShellKeepAliveMessage} from '../../../wire/wire.js'
export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(transport)
    .define(function(options, adb, router, transport) {
        var log = logger.createLogger('device:plugins:shell')
        router.on(ShellCommandMessage, async function(channel, message) {
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
                    transport.send([
                        channel,
                        reply.progress(chunk)
                    ])
                }
            }
            function endListener() {
                transport.send([
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
                // Keepalives arrive by message TYPE via the router (they are
                // addressed to the device, not to this response channel), so no
                // channel subscription is needed — routing is by deviceKey now.
                router.on(ShellKeepAliveMessage, keepAliveListener)
                timer = setTimeout(forceStop, message.timeout)
                return resolver.promise.finally(function() {
                    stream.removeListener('readable', readableListener)
                    stream.removeListener('end', endListener)
                    stream.removeListener('error', errorListener)
                    router.removeListener(wire.ShellKeepAliveMessage, keepAliveListener)
                    clearTimeout(timer)
                })
            }
            catch(err) {
                log.error('Shell command "%s" failed', message.command, err.stack)
                transport.send([
                    channel,
                    reply.fail(err.message)
                ])
            }
        })
    })
