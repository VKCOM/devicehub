import Promise from 'bluebird'
import logger from '../../util/logger.js'
import wire from '../../wire/index.js'
import wireutil from '../../wire/util.js'
import wirerouter from '../../wire/router.js'
import * as dbapi from '../../db/api.js'
import lifecycle from '../../util/lifecycle.js'
import srv from '../../util/srv.js'
import TtlSet from '../../util/ttlset.js'
import * as zmqutil from '../../util/zmqutil.js'
const log = logger.createLogger('reaper')
export default (function(options) {
    let ttlset = new TtlSet(options.heartbeatTimeout)
    // Input
    let sub = zmqutil.socket('sub')
    Promise.map(options.endpoints.sub, function(endpoint) {
        return srv.resolve(endpoint).then(function(records) {
            return srv.attempt(records, function(record) {
                log.info('Receiving input from "%s"', record.url)
                sub.connect(record.url)
                return Promise.resolve(true)
            })
        })
    })
        .catch(function(err) {
            log.fatal('Unable to connect to sub endpoint', err)
            lifecycle.fatal()
        });
    [wireutil.global].forEach(function(channel) {
        log.info('Subscribing to permanent channel "%s"', channel)
        sub.subscribe(channel)
    })
    // Output
    let push = zmqutil.socket('push')
    Promise.map(options.endpoints.push, function(endpoint) {
        return srv.resolve(endpoint).then(function(records) {
            return srv.attempt(records, function(record) {
                log.info('Sending output to "%s"', record.url)
                push.connect(record.url)
                return Promise.resolve(true)
            })
        })
    })
        .catch(function(err) {
            log.fatal('Unable to connect to push endpoint', err)
            lifecycle.fatal()
        })
    ttlset.on('insert', function(serial) {
        log.info('Device "%s" is present', serial)
        push.send([
            wireutil.global
            , wireutil.envelope(new wire.DevicePresentMessage(serial))
        ])
    })
    ttlset.on('drop', function(serial) {
        log.info('Reaping device "%s" due to heartbeat timeout', serial)
        push.send([
            wireutil.global
            , wireutil.envelope(new wire.DeviceAbsentMessage(serial))
        ])
    })
    function loadInitialState() {
        return dbapi.loadPresentDevices()
            .then(function(devices) {
                let now = Date.now()
                devices.forEach(function(device) {
                    ttlset.bump(device.serial, now, TtlSet.SILENT)
                })
            })
    }
    function listenToChanges() {
        sub.on('message', wirerouter()
            .on(wire.DeviceIntroductionMessage, function(channel, message) {
                message.status = 3
                ttlset.drop(message.serial, TtlSet.SILENT)
                ttlset.bump(message.serial, Date.now())
            })
            .on(wire.DeviceHeartbeatMessage, function(channel, message) {
                ttlset.bump(message.serial, Date.now())
            })
            .on(wire.DeviceAbsentMessage, function(channel, message) {
                ttlset.drop(message.serial, TtlSet.SILENT)
            })
            .handler())
    }
    log.info('Reaping devices with no heartbeat')
    lifecycle.observe(function() {
        [push, sub].forEach(function(sock) {
            try {
                sock.close()
            }
            catch (err) {
                log.error(err)
            }
        })
        ttlset.stop()
    })
    loadInitialState().then(listenToChanges).catch(function(err) {
        log.fatal('Unable to load initial state', err)
        lifecycle.fatal()
    })
})
