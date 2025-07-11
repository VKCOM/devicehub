import * as apiutil from '../../../util/apiutil.js'
import groups from './groups.js'
import dbapi from '../../../db/api.js'
import datautil from '../../../util/datautil.js'
import deviceutil from '../../../util/deviceutil.js'
import wireutil from '../../../wire/util.js'
import {WireRouter} from '../../../wire/router.js'
import wire from '../../../wire/index.js'
import {v4 as uuidv4} from 'uuid'
import logger from '../../../util/logger.js'
import * as Sentry from '@sentry/node'
import _ from 'lodash'
import useDevice, {UseDeviceError} from '../helpers/useDevice.js'

const log = logger.createLogger('api:controllers:autotests')

function captureDevices(req, res) {
    const amount = req.query.amount
    const needAmount = req.query.need_amount
    const runId = req.query.run // instead of group name
    const abi = req.query.abi
    const model = req.query.model
    const type = req.query.type
    const sdk = req.query.sdk
    const version = req.query.version
    const email = req.user.email
    const privilege = req.user.privilege
    const username = req.user.name
    const runUrl = req.query.runUrl
    let timeout = req.query.timeout
    if (!timeout) {
        apiutil.respond(res, 400, 'Timeout can`t be empty')
        return
    }
    else {
        timeout = Number(timeout) * 1000 // because Date use milliseconds
    }
    if (timeout > apiutil.ONE_HOUR * 3) {
        apiutil.respond(res, 400, 'Timeout can`t be more than 3 hours')
        return
    }
    const now = Date.now()
    const start = new Date(now)
    const stop = new Date(now + timeout)
    const dates = apiutil.computeGroupDates({start: start, stop: stop}, apiutil.ONCE, 0)
    const state = apiutil.READY
    if (amount < 1) {
        apiutil.respond(res, 400, 'Cant create group without devices')
        return
    }
    if (amount > 2 && privilege === apiutil.USER) {
        apiutil.respond(res, 400, 'Non admins cant use more than 2 devices')
        return
    }
    log.info('Creating group for autotests with params')
    log.info('Devices amount - ' + amount)
    log.info('Need amount - ' + needAmount)
    log.info('Run Id - ' + runId)
    log.info('Timeout - ' + timeout)
    groups.createGroupFunc(res, apiutil.ONCE, email, 0, runId, username, privilege, false, dates, start, stop, 0, state, runUrl)
        .then(function(group) {
            if (typeof group !== 'boolean' && group) {
                const deviceReq = { // fucking hell
                    params: {
                        id: group.id
                    },
                    query: {},
                    body: {
                        amount: amount,
                        needAmount: needAmount,
                        isInternal: true,
                        abi: abi,
                        model: model,
                        version: version,
                        sdk: sdk,
                        type: type
                    },
                    user: req.user,
                }
                return dbapi.addAdminsToGroup(group.id).then(() => {
                    return groups.addGroupDevices(deviceReq, res)
                })
            }
            else {
                apiutil.respond(res, 403, 'Forbidden (groups number quota is reached, autotests)')
            }
        })
        .catch(function(err) {
            apiutil.internalError(res, 'Failed to create group: ', err.stack)
        })
}

function addDevices(req, res) {
    const amount = req.query.amount
    const needAmount = req.query.need_amount
    const abi = req.query.abi
    const model = req.query.model
    const type = req.query.type
    const sdk = req.query.sdk
    const version = req.query.version
    const groupId = req.params.id

    const deviceReq = { // fucking hell
        params: {
            id: groupId
        },
        query: {},
        body: {
            amount: amount,
            needAmount: needAmount,
            isInternal: true,
            abi: abi,
            model: model,
            version: version,
            sdk: sdk,
            type: type
        },
        user: req.user,
    }
    return groups.addGroupDevices(deviceReq, res)
}

function freeDevices(req, res) {
    const groupId = req.query.group
    let request = {
        body: {
            ids: groupId
        },
        user: req.user,
        query: {
            redirected: true
        },
        options: req.options
    }
    groups.deleteGroups(request, res)
}

function installOnDevice(req, res) {
    const serial = req.params.serial
    const apkUrl = req.body.url.replace('apk', 'blob')
    let installFlags = apiutil.getBodyParameter(req.body, 'installFlags')
    if (installFlags) {
        installFlags = _.without(installFlags.toString().split(','), '')
    }
    log.info('Install apk from url: ' + apkUrl)
    log.info('Adb install flags: ' + installFlags)
    // log.info('Manifest captured succesfully')
    let manifest = {
        package: 'app_from_api',
        application: {launcherActivities: []}
    }
    return dbapi.loadDeviceBySerial(serial).then(device => {
        if (device === null) {
            res.status(404).json({
                success: false,
                description: 'Could not find device by serial'
            })
            return
        }
        let responseChannel = 'txn_' + uuidv4()
        req.options.sub.subscribe(responseChannel)
        // Timer will be called if no InstallResultMessage is received till 5 seconds
        let timer = setTimeout(function() {
            req.options.channelRouter.removeListener(responseChannel, messageListener)
            req.options.sub.unsubscribe(responseChannel)
            log.info('Installation result: Device is not responding')
            return apiutil.respond(res, 504, 'Device is not responding')
        }, apiutil.INSTALL_APK_WAIT)
        let messageListener = new WireRouter()
            .on(wire.InstallResultMessage, function(channel, message) {
                if (message.serial === serial) {
                    clearTimeout(timer)
                    req.options.sub.unsubscribe(responseChannel)
                    req.options.channelRouter.removeListener(responseChannel, messageListener)
                    log.info('Installation result:' + message.result)
                    if (message.result === 'Installed successfully') {
                        return res.json({
                            success: true,
                            description: message.result
                        })
                    }
                    else {
                        return res.status(400).json({
                            success: false,
                            description: message.result
                        })
                    }
                }
            })
            .handler()
        req.options.channelRouter.on(responseChannel, messageListener)
        let isApi = true
        log.info('Sending InstallMessage on channel ', device.channel, ' with response in ', responseChannel)
        req.options.push.send([
            device.channel,
            wireutil.transaction(responseChannel, new wire.InstallMessage(apkUrl, false, // <- doesn't work
                isApi, JSON.stringify(manifest), installFlags, req.internalJwt))
        ])
    })
}

async function useAndConnectDevice(req, res) {
    const serial = req.hasOwnProperty('body') ? req.body.serial : req.query.serial
    try {
        const device = await dbapi.loadDevice(req.user.groups.subscribed, serial)
        const remoteConnectUrl = await useDevice({
            user: req.user,
            device,
            channelRouter: req.options.channelRouter,
            push: req.options.push,
            sub: req.options.sub,
            usage: 'automation',
            log
        })

        return res.json({
            success: true,
            description: 'Device is in use and remote connection is enabled',
            remoteConnectUrl
        })
    }
    catch (/** @type {any} */err) {
        switch (err) {
        case UseDeviceError.NOT_FOUND:
            return res.status(404).json({
                success: false,
                description: 'Device not found'
            })

        case UseDeviceError.ALREADY_IN_USE:
            return res.status(403).json({
                success: false,
                description: 'Device is currently in use or not available'
            })

        case UseDeviceError.FAILED_JOIN:
            Sentry.captureMessage('504: Device is not responding (failed to join group)')
            return apiutil.respond(res, 504, 'Device is not responding (failed to join group)')

        case UseDeviceError.FAILED_CONNECT:
            Sentry.captureMessage('504: Device is not responding (failed to connect to device)')
            return apiutil.respond(res, 504, 'Device is not responding (failed to connect to device)')

        default:
            log.error('Failed to load device "%s": ', req.params.serial, err.stack)
            apiutil.respond(res, 500, 'Failed to load device', {deviceSerial: req.params.serial})
        }
    }
}
export {captureDevices}
export {freeDevices}
export {installOnDevice}
export {useAndConnectDevice}
export {addDevices}
export default {
    captureDevices: captureDevices,
    freeDevices: freeDevices,
    installOnDevice: installOnDevice,
    useAndConnectDevice: useAndConnectDevice,
    addDevices: addDevices
}
