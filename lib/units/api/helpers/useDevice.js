import {EventEmitter} from 'events'
import {SocketWrapper} from '../../../util/zmqutil.js'
import datautil from '../../../util/datautil.js'
import deviceutil from '../../../util/deviceutil.js'
import wireutil from '../../../wire/util.js'
import * as apiutil from '../../../util/apiutil.js'
import {WireRouter} from '../../../wire/router.js'
import wire from '../../../wire/index.js'
import {v4 as uuidv4} from 'uuid'
import {Log} from '../../../util/logger.js'
import {runTransaction} from '../../../wire/transmanager.js'
import {ConnectStartedMessage, GroupMessage, JoinGroupMessage, OwnerMessage, UngroupMessage} from '../../../wire/wire.js'

export const UseDeviceError = Object.freeze({
    NOT_FOUND: 0,
    ALREADY_IN_USE: 1,
    FAILED_JOIN: 2,
    FAILED_CONNECT: 3
})

/**
 * @param {Object} params
 * @param {any} params.user
 * @param {any} params.device
 * @param {EventEmitter} params.channelRouter
 * @param {SocketWrapper} params.push
 * @param {SocketWrapper} params.sub
 * @param {string|null=} params.usage
 * @param {Log=} params.log
 * @returns {Promise<string>}
 */
const useDevice = ({user, device, channelRouter, push, sub, usage = null, log}) => new Promise(async(resolve, reject) => {
    if (!device) {
        return reject(UseDeviceError.NOT_FOUND)
    }

    const timeout = (new Date(device.group.lifeTime.stop)).getTime() - Date.now()
    log?.info(`Device ${device.serial} in group ${device.group} use with timeout ${timeout}`)

    datautil.normalize(device, user)
    if (!deviceutil.isAddable(device)) {
        return reject(UseDeviceError.ALREADY_IN_USE)
    }

    const deviceRequirements = wireutil.toDeviceRequirements({
        serial: {
            value: device.serial,
            match: 'exact'
        }
    })

    try {
        await runTransaction(device.channel, UngroupMessage, {
            requirements: deviceRequirements
        }, {sub, push, channelRouter})
    }
    catch (/** @type {any} */e) {
        log?.info('Transaction failed: %s', e?.message)
    }

    const responseTimeout = setTimeout(function() {
        channelRouter.removeListener(wireutil.global, useDeviceMessageListener)
        return reject(UseDeviceError.FAILED_JOIN)
    }, apiutil.GRPC_WAIT_TIMEOUT)

    const useDeviceMessageListener = new WireRouter()
        .on(JoinGroupMessage, function(channel, message) {
            log?.info(device.serial + ' added to user group ' + user)

            if (message.serial === device.serial && message.owner.email === user.email) {
                clearTimeout(responseTimeout)
                channelRouter.removeListener(wireutil.global, useDeviceMessageListener)

                const responseChannel = 'txn_' + uuidv4()
                sub.subscribe(responseChannel)

                const connectTimeout = setTimeout(function() {
                    channelRouter.removeListener(responseChannel, messageListener)
                    sub.unsubscribe(responseChannel)

                    reject(UseDeviceError.FAILED_CONNECT)
                }, apiutil.GRPC_WAIT_TIMEOUT)

                const messageListener = new WireRouter()
                    .on(ConnectStartedMessage, function(channel, message) {
                        if (message.serial === device.serial) {
                            clearTimeout(connectTimeout)
                            sub.unsubscribe(responseChannel)
                            channelRouter.removeListener(responseChannel, messageListener)

                            resolve(message.url)
                        }
                    })
                    .handler()

                channelRouter.on(responseChannel, messageListener)
                push.send([
                    device.channel,
                    wireutil.transaction(responseChannel, new wire.ConnectStartMessage())
                ])
            }
        })
        .handler()

    channelRouter.on(wireutil.global, useDeviceMessageListener)

    try {
        await runTransaction(device.channel, GroupMessage, {
            owner: OwnerMessage.create({
                email: user.email,
                name: user.name,
                group: user.group
            }),
            requirements: deviceRequirements,
            usage: usage || undefined,
            keys: user.adbKeys?.map((/** @type {{ fingerprint: string }} */ k) => k.fingerprint) || []
        }, {sub, push, channelRouter})
    }
    catch (/** @type {any} */e) {
        log?.info('Transaction failed: %s', e?.message)
        clearTimeout(responseTimeout)
        channelRouter.removeListener(wireutil.global, useDeviceMessageListener)
        return reject(UseDeviceError.FAILED_JOIN)
    }
})

export default useDevice
