import Promise from 'bluebird'
import _ from 'lodash'
import logger from './logger.js'
import datautil from './datautil.js'
import wireutil from '../wire/util.js'
import wire from '../wire/index.js'
import * as Sentry from '@sentry/node'
import {v4 as uuidv4} from 'uuid'
const log = logger.createLogger('api:controllers:apiutil')
export const PENDING = 'pending'
export const READY = 'ready'
export const WAITING = 'waiting'
export const NOT_FOUND = 'not found'
export const BOOKABLE = 'bookable'
export const STANDARD = 'standard'
export const ONCE = 'once'
export const DEBUG = 'debug'
export const ORIGIN = 'origin'
export const STANDARDIZABLE = 'standardizable'
export const ROOT = 'root'
export const ADMIN = 'admin'
export const USER = 'user'
export const STF_ADMIN_EMAIL = process.env.STF_ADMIN_EMAIL || 'administrator@fakedomain.com'
export const ONE_SECOND = 1000
export const ONE_MN = ONE_SECOND * 60
export const FIVE_MN = 300 * 1000
export const TEN_MINUTES = FIVE_MN * 2
export const QUARTER_MINUTES = FIVE_MN * 3
export const HALF_HOUR = 1800 * 1000
export const ONE_HOUR = 3600 * 1000
export const ONE_DAY = 24 * ONE_HOUR
export const ONE_WEEK = 7 * ONE_DAY
export const ONE_MONTH = 30 * ONE_DAY
export const ONE_QUATER = 3 * ONE_MONTH
export const ONE_HALF_YEAR = 6 * ONE_MONTH
export const ONE_YEAR = 365 * ONE_DAY
export const TEN_YEARS = ONE_YEAR * 10
export const MAX_USER_GROUPS_NUMBER = 10
export const MAX_USER_GROUPS_DURATION = 15 * ONE_DAY
export const MAX_USER_GROUPS_REPETITIONS = 10
export const CLASS_DURATION = {
    once: Infinity,
    bookable: Infinity,
    standard: Infinity,
    hourly: ONE_HOUR,
    daily: ONE_DAY,
    weekly: ONE_WEEK,
    monthly: ONE_MONTH,
    quaterly: ONE_QUATER,
    halfyearly: ONE_HALF_YEAR,
    yearly: ONE_YEAR,
    debug: FIVE_MN
}
export const GRPC_WAIT_TIMEOUT = ONE_SECOND * 20
export const INSTALL_APK_WAIT = ONE_MN * 5
export const isOriginGroup = function(_class) {
    return _class === BOOKABLE || _class === STANDARD
}
export const isAdminGroup = function(_class) {
    return isOriginGroup(_class) || _class === DEBUG
}
export const truncateString = (str, num) =>{
    if (str.length > num) {
        return str.slice(0, num) + '...'
    }
    else {
        return str
    }
}

/**
 * Respond to an api call helper function
 * @param {*} res Express js response object
 * @param {number} code Code to respond with
 * @param {string=} message Error message
 * @param {object=} data Additional data to append to an object
 * @returns {*} res
 */
export const respond = function(res, code, message, data) {
    if (res.headersSent) {
        log.error('Headers already sent when trying to respond with', code, message, data)
        return res
    }
    log.info('Responding with', code, message, truncateString(JSON.stringify(data) + '', 600))
    Sentry.addBreadcrumb({
        data: {code, message, data},
        message: 'Responding to API call.',
        level: 'info',
        type: 'default'
    })
    const status = code >= 200 && code < 300
    const response = {
        success: status,
        description: message
    }
    if (data) {
        for (const key in data) {

            if (data.hasOwnProperty(key)) {
                response[key] = data[key]
            }
        }
    }
    res.setHeader('Cache-Control', 'no-store')
    res.status(code).json(response)
    return res
}
export const internalError = function(res, ...args) {
    log.error.apply(log, args)
    console.trace('error occured here')
    respond(res, 500, 'Internal Server Error')
}
export const publishGroup = function(group) {
    delete group.createdAt
    delete group.ticket
    return group
}
export const publishTeam = function(team) {
    delete team._id
    return team
}
export const publishDevice = function(device, req, isGenerator) {
    let user = req.user
    datautil.normalize(device, user, isGenerator)
    return device
}
export const publishUser = function(user) {
    //  delete user.groups.lock
    return user
}
export const publishAccessToken = function(token) {
    delete token._id
    return token
}
export const filterDevice = function(req, device) {
    const fields = req.query.fields
    let isGenerator = false
    if (req.headers.is_generator === '1') {
        isGenerator = true
        let responseChannel = 'txn_' + uuidv4()
        req.options.push.send([
            device.channel,
            wireutil.transaction(responseChannel, new wire.ConnectGetForwardUrlMessage())
        ])
    }
    if (fields) {
        return _.pick(publishDevice(device, req, isGenerator), fields.split(','))
    }
    return publishDevice(device, req, isGenerator)
}
export const computeDuration = function(group, deviceNumber) {
    return (group.devices.length + deviceNumber) *
        (group.dates[0].stop - group.dates[0].start) *
        (group.repetitions + 1)
}
export const lightComputeStats = function(res, stats) {
    if (stats.locked) {
        respond(res, 429, 'Too many requests. Destination object is locked')
        return Promise.reject('busy')
    }
    return 'not found'
}
export const computeStats = function(res, stats, objectName, ...lock) {
    if (stats.modifiedCount === 0) {
        if (stats.skipped) {
            return respond(res, 404, `Not Found (${objectName})`)
        }
        if (stats.locked) {
            return respond(res, 429, 'Too many requests. Destination object is locked')
        }
        console.trace(`403 from here Forbidden (${objectName} not changed)`)
        return respond(res, 403, `Forbidden (${objectName} not changed)`)
    }
    if (lock.length) {
        lock[0][objectName] = stats.changes[0].new_val
    }
    return true
}
export const lockResult = function(stats) {
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
export const lockDeviceResult = function(stats, fn, groups, serial) {
    const result = lockResult(stats)
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

const sleep = (delay) => new Promise((resolve) => {
    setTimeout(resolve, delay)
})

export const setIntervalWrapper = async function(fn, numTimes, delay) {
    let lastResult = null
    for (let attempt = 0; attempt < numTimes; attempt++) {
        log.warn(`Trying ${fn.name} ${attempt + 1}/${numTimes}`)
        lastResult = await fn()
        if (lastResult.status) {
            return lastResult.data
        }
        log.warn(`Retrying ${fn.name} ${attempt + 1}/${numTimes}`)
        await sleep(delay)
    }
    return Promise.reject(lastResult?.data)
}

export const setIntervalWrapperOld = async function(fn, numTimes, delay) {
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
export const redirectApiWrapper = function(field, fn, req, res) {
    // what the actual fuck
    if (typeof req.body === 'undefined') {
        req.body = {}
    }
    req.body[field + 's'] = req.query[field] ?? req.params[field]
    req.query.redirected = true
    fn(req, res)
}
export const computeGroupDates = function(lifeTime, _class, repetitions) {
    const dates = new Array(lifeTime)
    for (let repetition = 1, currentLifeTime = {
        start: new Date(lifeTime.start.getTime()),
        stop: new Date(lifeTime.stop.getTime())
    }; repetition < repetitions; repetition++) {
        currentLifeTime.start = new Date(currentLifeTime.start.getTime() +
            CLASS_DURATION[_class])
        currentLifeTime.stop = new Date(currentLifeTime.stop.getTime() +
            CLASS_DURATION[_class])
        dates.push({
            start: new Date(currentLifeTime.start.getTime()),
            stop: new Date(currentLifeTime.stop.getTime())
        })
    }
    return dates
}
export const checkBodyParameter = function(body, parameter) {
    return typeof body !== 'undefined' && typeof body[parameter] !== 'undefined'
}
export const getBodyParameter = function(body, parameter) {
    let undef
    return checkBodyParameter(body, parameter) ? body[parameter] : undef
}
export const checkQueryParameter = function(parameter) {
    return typeof parameter !== 'undefined' && typeof parameter.value !== 'undefined'
}
export const getQueryParameter = function(parameter) {
    let undef
    return checkQueryParameter(parameter) ? (parameter.value ?? parameter) : undef
}
export const prepareFieldsForMongoDb = function(fields) {
    if (fields) {
        return fields.split(',').reduce(function(result, field) {
            if(field && field.trim().length > 0) {
                return {
                    ...result,
                    [field.trim()]: 1
                }
            }
            else {
                return {
                    ...result,
                }
            }
        }, {_id: 0})
    }
    return null
}

export const hasGroupEditPermission = function(group, user, allowModerator = true) {
    return user.privilege === ADMIN ||
    group.owner.email === user.email ||
    (allowModerator && Array.isArray(group.moderators) && group.moderators.includes(user.email))
}

export const isOwnerGroup = function(group, email) {
    return group.owner.email === email
}

export default {
    PENDING,
    READY,
    WAITING,
    NOT_FOUND,
    BOOKABLE,
    STANDARD,
    ONCE,
    DEBUG,
    ORIGIN,
    STANDARDIZABLE,
    ROOT,
    ADMIN,
    USER,
    STF_ADMIN_EMAIL,
    ONE_SECOND,
    ONE_MN,
    FIVE_MN,
    TEN_MINUTES,
    QUARTER_MINUTES,
    HALF_HOUR,
    ONE_HOUR,
    ONE_DAY,
    ONE_WEEK,
    ONE_MONTH,
    ONE_QUATER,
    ONE_HALF_YEAR,
    ONE_YEAR,
    TEN_YEARS,
    MAX_USER_GROUPS_NUMBER,
    MAX_USER_GROUPS_DURATION,
    MAX_USER_GROUPS_REPETITIONS,
    CLASS_DURATION,
    GRPC_WAIT_TIMEOUT,
    INSTALL_APK_WAIT,
    isOriginGroup,
    isAdminGroup,
    respond,
    internalError,
    publishGroup,
    publishDevice,
    publishUser,
    publishAccessToken,
    filterDevice,
    computeDuration,
    lightComputeStats,
    computeStats,
    lockResult,
    lockDeviceResult,
    setIntervalWrapper,
    redirectApiWrapper,
    computeGroupDates,
    checkBodyParameter,
    getBodyParameter,
    checkQueryParameter,
    getQueryParameter,
    prepareFieldsForMongoDb,
    hasGroupEditPermission,
    isOwnerGroup
}
