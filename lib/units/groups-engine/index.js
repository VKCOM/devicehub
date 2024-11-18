import events from 'events'
import Promise from 'bluebird'
import logger from '../../util/logger.js'
import * as zmqutil from '../../util/zmqutil.js'
import srv from '../../util/srv.js'
import lifecycle from '../../util/lifecycle.js'
import wireutil from '../../wire/util.js'
import groupsScheduler from './scheduler/index.js'
import groupsWatcher from './watchers/groups.js'
import devicesWatcher from './watchers/devices.js'
import usersWatcher from './watchers/users.js'
import * as dbapi from '../../db/api.js'
export default (function(options) {
    const log = logger.createLogger('groups-engine')
    const channelRouter = new events.EventEmitter()
    const push = zmqutil.socket('push')
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
    // Input
    const sub = zmqutil.socket('sub')
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
        })
    const pushdev = zmqutil.socket('push')
    Promise.map(options.endpoints.pushdev, function(endpoint) {
        return srv.resolve(endpoint).then(function(records) {
            return srv.attempt(records, function(record) {
                log.info('Sending output to "%s"', record.url)
                pushdev.connect(record.url)
                return Promise.resolve(true)
            })
        })
    })
        .catch(function(err) {
            log.fatal('Unable to connect to pushdev endpoint', err)
            lifecycle.fatal()
        })
    const subdev = zmqutil.socket('sub')
    Promise.map(options.endpoints.subdev, function(endpoint) {
        return srv.resolve(endpoint).then(function(records) {
            return srv.attempt(records, function(record) {
                log.info('Receiving input from "%s"', record.url)
                subdev.connect(record.url)
                return Promise.resolve(true)
            })
        })
    })
        .catch(function(err) {
            log.fatal('Unable to connect to subdev endpoint', err)
            lifecycle.fatal()
        });
    [wireutil.global].forEach(function(channel) {
        log.info('Subscribing to permanent channel "%s"', channel)
        sub.subscribe(channel)
        subdev.subscribe(channel)
    })
    sub.on('message', function(channel, data) {
        channelRouter.emit(channel.toString(), channel, data)
    })
    subdev.on('message', function(channel, data) {
        channelRouter.emit(channel.toString(), channel, data)
    })
    groupsScheduler()
    groupsWatcher(push, pushdev, channelRouter)
    devicesWatcher(push, pushdev, channelRouter)
    usersWatcher(pushdev)
    dbapi.getRootGroup().then(group => {
        dbapi.unlockGroup(group.id).then(status => {
            if (status.modifiedCount === 0) {
                log.info('Origin group already unlocked')
            }
            if (status.modifiedCount > 1) {
                log.warn('Origin group was locked')
            }
        })
    })
    lifecycle.observe(function() {
        [push, sub, pushdev, subdev].forEach(function(sock) {
            try {
                sock.close()
            }
            catch (err) {
                // No-op
            }
        })
    })
    log.info('Groups engine started')
})
