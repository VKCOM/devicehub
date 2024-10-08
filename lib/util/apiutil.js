import Promise from 'bluebird'
import _ from 'lodash'
import logger from './logger.js'
import datautil from './datautil.js'
import wireutil from '../wire/util.js'
import wire from '../wire/index.js'
import uuid from 'uuid'
const apiutil = Object.create(null)
const log = logger.createLogger('api:controllers:apiutil')
apiutil.PENDING = 'pending'
apiutil.READY = 'ready'
apiutil.WAITING = 'waiting'
apiutil.NOT_FOUND = 'not found'
apiutil.BOOKABLE = 'bookable'
apiutil.STANDARD = 'standard'
apiutil.ONCE = 'once'
apiutil.DEBUG = 'debug'
apiutil.ORIGIN = 'origin'
apiutil.STANDARDIZABLE = 'standardizable'
apiutil.ROOT = 'root'
apiutil.ADMIN = 'admin'
apiutil.USER = 'user'
apiutil.STF_ADMIN_EMAIL = 'administrator@fakedomain.com'
apiutil.ONE_SECOND = 1000
apiutil.ONE_MN = apiutil.ONE_SECOND * 60
apiutil.FIVE_MN = 300 * 1000
apiutil.TEN_MINUTES = apiutil.FIVE_MN * 2
apiutil.QUARTER_MINUTES = apiutil.FIVE_MN * 3
apiutil.HALF_HOUR = 1800 * 1000
apiutil.ONE_HOUR = 3600 * 1000
apiutil.ONE_DAY = 24 * apiutil.ONE_HOUR
apiutil.ONE_WEEK = 7 * apiutil.ONE_DAY
apiutil.ONE_MONTH = 30 * apiutil.ONE_DAY
apiutil.ONE_QUATER = 3 * apiutil.ONE_MONTH
apiutil.ONE_HALF_YEAR = 6 * apiutil.ONE_MONTH
apiutil.ONE_YEAR = 365 * apiutil.ONE_DAY
apiutil.TEN_YEARS = apiutil.ONE_YEAR * 10
apiutil.MAX_USER_GROUPS_NUMBER = 10
apiutil.MAX_USER_GROUPS_DURATION = 15 * apiutil.ONE_DAY
apiutil.MAX_USER_GROUPS_REPETITIONS = 10
apiutil.CLASS_DURATION = {
    once: Infinity
    , bookable: Infinity
    , standard: Infinity
    , hourly: apiutil.ONE_HOUR
    , daily: apiutil.ONE_DAY
    , weekly: apiutil.ONE_WEEK
    , monthly: apiutil.ONE_MONTH
    , quaterly: apiutil.ONE_QUATER
    , halfyearly: apiutil.ONE_HALF_YEAR
    , yearly: apiutil.ONE_YEAR
    , debug: apiutil.FIVE_MN
}
apiutil.GRPC_TIMEOUT = apiutil.ONE_SECOND * 10
apiutil.GRPC_WAIT_TIMEOUT = apiutil.GRPC_TIMEOUT * 2
apiutil.INSTALL_APK_WAIT = apiutil.ONE_MN * 9
apiutil.isOriginGroup = function(_class) {
    return _class === apiutil.BOOKABLE || _class === apiutil.STANDARD
}
apiutil.isAdminGroup = function(_class) {
    return apiutil.isOriginGroup(_class) || _class === apiutil.DEBUG
}
apiutil.internalError = function(res, ...args) {
    log.error.apply(log, args)
    apiutil.respond(res, 500, 'Internal Server Error')
}
apiutil.respond = function(res, code, message, data) {
    const status = code >= 200 && code < 300
    const response = {
        success: status
        , description: message
    }
    if (data) {
        for (const key in data) {
            // eslint-disable-next-line no-prototype-builtins
            if (data.hasOwnProperty(key)) {
                response[key] = data[key]
            }
        }
    }
    res.setHeader('Cache-Control', 'no-store')
    res.status(code).json(response)
    return status
}
apiutil.publishGroup = function(group) {
    delete group.createdAt
    delete group.ticket
    return group
}
apiutil.publishDevice = function(device, req, isGenerator) {
    let user = req.user
    datautil.normalize(device, user, isGenerator)

    /* if (isGenerator) {
      let responseChannel = 'txn_' + uuid.v4()
      req.options.push.send([
        device.channel
        , wireutil.transaction(
          responseChannel
          , new wire.ConnectStopMessage()
        )
      ])
    } */
    //  delete device.group.lock
    return device
}
apiutil.publishUser = function(user) {
    //  delete user.groups.lock
    return user
}
apiutil.publishAccessToken = function(token) {
    delete token.email
    delete token.jwt
    return token
}
apiutil.filterDevice = function(req, device) {
    const fields = req.query.fields
    let isGenerator = false
    if (req.headers.is_generator === '1') {
        isGenerator = true
        let responseChannel = 'txn_' + uuid.v4()
        req.options.push.send([
            device.channel
            , wireutil.transaction(responseChannel, new wire.ConnectGetForwardUrlMessage())
        ])
    }
    if (fields) {
        return _.pick(apiutil.publishDevice(device, req, isGenerator), fields.split(','))
    }
    return apiutil.publishDevice(device, req, isGenerator)
}
apiutil.computeDuration = function(group, deviceNumber) {
    return (group.devices.length + deviceNumber) *
        (group.dates[0].stop - group.dates[0].start) *
        (group.repetitions + 1)
}
apiutil.lightComputeStats = function(res, stats) {
    if (stats.locked) {
        apiutil.respond(res, 429, 'Too many requests. Destination object is locked')
        return Promise.reject('busy')
    }
    return 'not found'
}
apiutil.computeStats = function(res, stats, objectName, ...lock) {
    if (stats.modifiedCount === 0) {
        if (stats.skipped) {
            return apiutil.respond(res, 404, `Not Found (${objectName})`)
        }
        if (stats.locked) {
            return apiutil.respond(res, 429, 'Too many requests. Destination object is locked')
        }
        return apiutil.respond(res, 403, `Forbidden (${objectName})`)
    }
    if (lock.length) {
        lock[0][objectName] = stats.changes[0].new_val
    }
    return true
}
apiutil.lockResult = function(stats) {
    let result = {status: false, data: stats}
    if (stats.modifiedCount > 0 || stats.matchedCount > 0) {
        result.status = true
        result.data.locked = false
    }
    else {
        result.data.locked = true
    }
    return result
}
apiutil.lockDeviceResult = function(stats, fn, groups, serial) {
    const result = apiutil.lockResult(stats)
    if (!result.status) {
        return fn(groups, serial).then(function(devices) {
            if (!devices.length) {
                result.data.locked = false
                result.status = true
            }
            return result
        })
    }
    return result
}
apiutil.setIntervalWrapper = function(fn, numTimes, delay) {
    return fn().then(function(result) {
        if (result.status) {
            return result.data
        }
        return new Promise(function(resolve, reject) {
            let counter = 0
            const interval = setInterval(function() {
                return fn().then(function(result) {
                    if (result.status || ++counter === numTimes) {
                        if (!result.status && counter === numTimes) {
                            log.warn('%s() failed %s times in a loop!', fn.name, counter)
                        }
                        clearInterval(interval)
                        resolve(result.data)
                    }
                })
                    .catch(function(err) {
                    clearInterval(interval)
                    reject(err)
                })
            }, delay)
        })
    })
}
apiutil.redirectApiWrapper = function(field, fn, req, res) {
    // what the actual fuck
    if (typeof req.body === 'undefined') {
        req.body = {}
    }
    req.body[field + 's'] = req.query[field]
    req.query.redirected = true
    fn(req, res)
}
apiutil.computeGroupDates = function(lifeTime, _class, repetitions) {
    const dates = new Array(lifeTime)
    for (let repetition = 1, currentLifeTime = {
        start: new Date(lifeTime.start.getTime())
        , stop: new Date(lifeTime.stop.getTime())
    }; repetition <= repetitions; repetition++) {
        currentLifeTime.start = new Date(currentLifeTime.start.getTime() +
            apiutil.CLASS_DURATION[_class])
        currentLifeTime.stop = new Date(currentLifeTime.stop.getTime() +
            apiutil.CLASS_DURATION[_class])
        dates.push({
            start: new Date(currentLifeTime.start.getTime())
            , stop: new Date(currentLifeTime.stop.getTime())
        })
    }
    return dates
}
apiutil.checkBodyParameter = function(body, parameter) {
    return typeof body !== 'undefined' && typeof body[parameter] !== 'undefined'
}
apiutil.getBodyParameter = function(body, parameter) {
    let undef
    return apiutil.checkBodyParameter(body, parameter) ? body[parameter] : undef
}
apiutil.checkQueryParameter = function(parameter) {
    return typeof parameter !== 'undefined' && typeof parameter.value !== 'undefined'
}
apiutil.getQueryParameter = function(parameter) {
    let undef
    return apiutil.checkQueryParameter(parameter) ? (parameter.value ?? parameter) : undef
}
export default apiutil
