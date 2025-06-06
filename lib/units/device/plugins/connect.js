import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
import Promise from 'bluebird'
import logger from '../../../util/logger.js'
import * as grouputil from '../../../util/grouputil.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import lifecycle from '../../../util/lifecycle.js'
import db from '../../../db/index.js'
import dbapi from '../../../db/api.js'
import adb from '../support/adb.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import group from './group.js'
import solo from './solo.js'
import urlformat from './util/urlformat.js'
export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(push)
    .dependency(group)
    .dependency(solo)
    .dependency(urlformat)
    .define(async function(options, adb, router, push, group, solo, urlformat) {
        var log = logger.createLogger('device:plugins:connect')
        var plugin = Object.create(null)
        var activeServer = null

        await db.connect()

        plugin.port = options.connectPort
        plugin.url = urlformat(options.connectUrlPattern, plugin.port)
        plugin.start = function() {
            log.info('Starting connect plugin')
            return new Promise(function(resolve, reject) {
                if (plugin.isRunning()) {
                    return resolve(plugin.url)
                }
                var server = adb.createTcpUsbBridge(options.serial, {
                    auth: function(key) {
                        var resolver = Promise.defer()
                        function notify() {
                            // @ts-ignore
                            group.get()
                                .then(function(currentGroup) {
                                    push.send([
                                        solo.channel
                                        , wireutil.envelope(new wire.JoinGroupByAdbFingerprintMessage(options.serial, key.fingerprint, key.comment, currentGroup.group))
                                    ])
                                })
                                .catch(grouputil.NoGroupError, function() {
                                    push.send([
                                        solo.channel
                                        , wireutil.envelope(new wire.JoinGroupByAdbFingerprintMessage(options.serial, key.fingerprint, key.comment))
                                    ])
                                })
                        }
                        function joinListener(group, identifier) {
                            if (identifier !== key.fingerprint) {
                                resolver.reject(new Error('Somebody else took the device'))
                            }
                        }
                        function autojoinListener(identifier, joined) {
                            if (identifier === key.fingerprint) {
                                if (joined) {
                                    resolver.resolve()
                                }
                                else {
                                    resolver.reject(new Error('Device is already in use'))
                                }
                            }
                        }
                        group.on('join', joinListener)
                        group.on('autojoin', autojoinListener)
                        router.on(wire.AdbKeysUpdatedMessage, notify)
                        notify()
                        return resolver.promise
                            .timeout(120000)
                            .finally(function() {
                                group.removeListener('join', joinListener)
                                group.removeListener('autojoin', autojoinListener)
                                router.removeListener(wire.AdbKeysUpdatedMessage, notify)
                            })
                    }
                })
                server.on('listening', function() {
                    resolve(plugin.url)
                })
                server.on('connection', function(conn) {
                    // @ts-ignore
                    log.info('New remote ADB connection from %s', conn.remoteAddress)
                    conn.on('userActivity', function() {
                        // @ts-ignore
                        group.keepalive()
                    })
                })
                server.on('error', reject)
                log.info(util.format('Listening on port %d', plugin.port))
                server.listen(plugin.port)
                activeServer = server
                lifecycle.share('Remote ADB', activeServer)
            })
        }
        plugin.stop = Promise.method(function() {
            if (plugin.isRunning()) {
                activeServer.close()
                activeServer.end()
                activeServer = null
            }
        })
        plugin.end = Promise.method(function() {
            if (plugin.isRunning()) {
                activeServer.end()
            }
        })
        plugin.isRunning = function() {
            return !!activeServer
        }
        lifecycle.observe(plugin.stop)
        group.on('leave', plugin.stop)
        router
            .on(wire.ConnectStartMessage, function(channel) {
                let reply = wireutil.reply(options.serial)
                plugin.start()
                    .then(function(directUrl) {
                        dbapi.loadDeviceBySerial(options.serial).then((device) =>{
                            let baseUrl = options.storageUrl.split('/')[2]
                            baseUrl = baseUrl.split(':')
                            let url
                            if (device.adbPort) {
                                url = baseUrl[0] + ':' + device.adbPort.toString()
                            }
                            else {
                                if (options.urlWithoutAdbPort) {
                                    url = directUrl
                                }
                                else {
                                    url = 'unavailable. Contact administrator'
                                }
                            }

                            push.send([
                                channel
                                , reply.okay(url)
                            ])

                            // Update DB
                            push.send([
                                channel
                                , wireutil.envelope(new wire.ConnectStartedMessage(
                                    options.serial
                                    , url
                                ))
                            ])
                            log.important('Remote Connect Started for device "%s" at "%s"', options.serial, url)
                        })
                    })
                    .catch(function(err) {
                        log.error('Unable to start remote connect service', err.stack)
                        push.send([
                            channel
                            , reply.fail(err.message)
                        ])
                    })
            })
            .on(wire.ConnectGetForwardUrlMessage, function(channel) {
                let reply = wireutil.reply(options.serial)
                plugin.start()
                    .then(function(url) {
                        push.send([
                            channel
                            , reply.okay(url)
                        ])
                        // Update DB
                        push.send([
                            channel
                            , wireutil.envelope(new wire.ConnectStartedMessage(options.serial, url))
                        ])
                        log.important('Remote Connect Started for device "%s" at "%s"', options.serial, url)
                    })
                    .catch(function(err) {
                        log.error('Unable to start remote connect service', err.stack)
                        push.send([
                            channel
                            , reply.fail(err.message)
                        ])
                    })
            })
            .on(wire.ConnectStopMessage, function(channel) {
                var reply = wireutil.reply(options.serial)
                plugin.stop()
                    .then(function() {
                        push.send([
                            channel
                            , reply.okay()
                        ])
                        // Update DB
                        push.send([
                            channel
                            , wireutil.envelope(new wire.ConnectStoppedMessage(options.serial))
                        ])
                        log.important('Remote Connect Stopped for device "%s"', options.serial)
                    })
                    .catch(function(err) {
                        log.error('Failed to stop connect service', err.stack)
                        push.send([
                            channel
                            , reply.fail(err.message)
                        ])
                    })
            })
        return (plugin)
    })
