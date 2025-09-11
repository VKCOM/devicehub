import Promise from 'bluebird'
import logger from '../../util/logger.js'
import wire from '../../wire/index.js'
import {WireRouter} from '../../wire/router.js'
import wireutil from '../../wire/util.js'
import lifecycle from '../../util/lifecycle.js'
import srv from '../../util/srv.js'
import dbapi from '../../db/api.js'
import * as zmqutil from '../../util/zmqutil.js'
export default (function(options) {
    var log = logger.createLogger('log-db')
    // Input
    var sub = zmqutil.socket('sub')
    Promise.map(options.endpoints.sub, function(endpoint) {
        return srv.resolve(endpoint).then(function(records) {
            return srv.attempt(records, function(record) {
                log.info('Receiving input from "%s"', record.url)
                sub.connect(record.url)
                return Promise.resolve(true)
            })
        })
    });
    [wireutil.global].forEach(function(channel) {
        log.info('Subscribing to permanent channel "%s"', channel)
        sub.subscribe(channel)
    })
    sub.on('message', new WireRouter()
        .on(wire.DeviceLogMessage, function(channel, message) {
            if (message.priority >= options.priority) {
                dbapi.saveDeviceLog(message.serial, message)
            }
        })
        .handler())
    log.info('Listening for %s (or higher) level log messages', logger.LevelLabel[options.priority])
    lifecycle.observe(function() {
        try {
            sub.close()
        }
        catch (err) {
            // No-op
        }
    })
})
