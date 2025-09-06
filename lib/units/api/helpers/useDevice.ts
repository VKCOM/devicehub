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

export const UseDeviceError = Object.freeze({
    NOT_FOUND: 0,
    ALREADY_IN_USE: 1,
    FAILED_JOIN: 2,
    FAILED_CONNECT: 3
})

interface UseDeviceParams {
    user: any
    device: any
    channelRouter: EventEmitter
    push: SocketWrapper
    sub: SocketWrapper
    usage?: string | null
    log?: Log
}

const useDevice = ({user, device, channelRouter, push, sub, usage = null, log}: UseDeviceParams) =>
    new Promise<string>(async(resolve, reject) => {
        if (!device) {
            return reject(UseDeviceError.NOT_FOUND)
        }

        const timeout = (new Date(device.group.lifeTime.stop)).getTime() - Date.now()

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

        log?.info(
            `[useDevice] Device ${device.serial} in group ${device.group}, use with timeout - %s, requirements - %s`,
            timeout,
            JSON.stringify(deviceRequirements, null, 2)
        )

        try {
            await runTransaction(device.channel, new wire.UngroupMessage(deviceRequirements), {sub, push, channelRouter})
            log?.info('[useDevice] Successfully send and processed transaction (UngroupMessage)')
        }
        catch (e: any) {
            log?.info('[useDevice] Failed to run transaction (UngroupMessage):', e)
        }

        const responseTimeout = setTimeout(() => {
            channelRouter.removeListener(wireutil.global, useDeviceMessageListener)
            return reject(UseDeviceError.FAILED_JOIN)
        }, apiutil.GRPC_WAIT_TIMEOUT)

        const useDeviceMessageListener = new WireRouter()
            .on(wire.JoinGroupMessage, (channel, message) => {
                log?.info(`[useDevice] Device ${device.serial} added to user group ${user} (JoinGroupMessage)`)

                if (message.serial === device.serial && message.owner.email === user.email) {
                    clearTimeout(responseTimeout)
                    channelRouter.removeListener(wireutil.global, useDeviceMessageListener)

                    const responseChannel = 'txn_' + uuidv4()
                    sub.subscribe(responseChannel)

                    const connectTimeout = setTimeout(function() {
                        channelRouter.removeListener(responseChannel, useDeviceMessageListener)
                        sub.unsubscribe(responseChannel)

                        reject(UseDeviceError.FAILED_CONNECT)
                    }, apiutil.GRPC_WAIT_TIMEOUT)

                    const messageListener = new WireRouter()
                        .on(wire.ConnectStartedMessage, function(channel, message) {
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
            await runTransaction(device.channel, new wire.GroupMessage(
                new wire.OwnerMessage(user.email, user.name, user.group)
                , timeout
                , deviceRequirements
                , usage
            ), {sub, push, channelRouter})

            log?.info('[useDevice] Successfully send and processed transaction (GroupMessage)')
        }
        catch (e) {
            log?.info('[useDevice] Failed to run transaction (GroupMessage):', e)
            reject(e)
        }
    })

export default useDevice
