import Promise from 'bluebird'
import logger from '../../util/logger.js'
import wire from '../../wire/index.js'
import {WireRouter} from '../../wire/router.js'
import wireutil from '../../wire/util.js'
import db from '../../db/index.js'
import dbapi from '../../db/models/all/index.js'
import lifecycle from '../../util/lifecycle.js'
import srv from '../../util/srv.js'
import * as zmqutil from '../../util/zmqutil.js'

export default db.ensureConnectivity(async function(options) {
    const log = logger.createLogger('processor')
    if (options.name) {
        logger.setGlobalIdentifier(options.name)
    }

    const {
        push
        , pushdev
        , sub
        , subdev
        , channelRouter
    } = await db.createZMQSockets(options.endpoints, log)
    await db.connect({push, pushdev, channelRouter})

    // App side
    const appDealer = zmqutil.socket('dealer')
    Promise.all(options.endpoints.appDealer.map(async(endpoint) => {
        try {
            return srv.resolve(endpoint).then(function(records) {
                return srv.attempt(records, async function(record) {
                    log.info('App dealer connected to "%s"', record.url)
                    appDealer.connect(record.url)
                    return true
                })
            })
        }
        catch (err) {
            log.fatal('Unable to connect to app dealer endpoint', err)
            lifecycle.fatal()
        }
    }))

    // Device side
    const devDealer = zmqutil.socket('dealer')
    appDealer.on('message', function(channel, data) {
        devDealer.send([channel, data])
    })
    Promise.all(options.endpoints.devDealer.map(async(endpoint) => {
        try {
            return srv.resolve(endpoint).then(function(records) {
                return srv.attempt(records, async function(record) {
                    log.info('Device dealer connected to "%s"', record.url)
                    devDealer.connect(record.url)
                    return true
                })
            })
        }
        catch (err) {
            log.fatal('Unable to connect to dev dealer endpoint', err)
            lifecycle.fatal()
        }
    }))

    const defaultWireHandler = (channel, _, data) => appDealer.send([channel, data])

    const router = new WireRouter()
        .on(wire.UpdateAccessTokenMessage, defaultWireHandler)
        .on(wire.DeleteUserMessage, defaultWireHandler)
        .on(wire.DeviceChangeMessage, defaultWireHandler)
        .on(wire.UserChangeMessage, defaultWireHandler)
        .on(wire.GroupChangeMessage, defaultWireHandler)
        .on(wire.DeviceGroupChangeMessage, defaultWireHandler)
        .on(wire.GroupUserChangeMessage, defaultWireHandler)
        .on(wire.DeviceHeartbeatMessage, defaultWireHandler)
        .on(wire.DeviceLogMessage, defaultWireHandler)
        .on(wire.TransactionProgressMessage, defaultWireHandler)
        .on(wire.TransactionDoneMessage, defaultWireHandler)
        .on(wire.TransactionTreeMessage, defaultWireHandler)
        .on(wire.InstallResultMessage, defaultWireHandler)
        .on(wire.DeviceLogcatEntryMessage, defaultWireHandler)
        .on(wire.TemporarilyUnavailableMessage, defaultWireHandler)
        .on(wire.UpdateRemoteConnectUrl, defaultWireHandler)
        .on(wire.InstalledApplications, defaultWireHandler)
        .on(wire.DeviceIntroductionMessage, async(channel, message, data) => {
            await dbapi.saveDeviceInitialState(message.serial, message)
            devDealer.send([
                message.provider.channel,
                wireutil.envelope(new wire.DeviceRegisteredMessage(message.serial))
            ])
            appDealer.send([channel, data])
        })
        .on(wire.InitializeIosDeviceState, (channel, message, data) => {
            dbapi.initializeIosDeviceState(options.publicIp, message)
        })
        .on(wire.DevicePresentMessage, async(channel, message, data) => {
            await dbapi.setDevicePresent(message.serial)
            appDealer.send([channel, data])
        })
        .on(wire.DeviceAbsentMessage, async(channel, message, data) => {
            if (!message.applications) {
                await dbapi.setDeviceAbsent(message.serial)
                appDealer.send([channel, data])
            }
        })
        .on(wire.DeviceStatusMessage, (channel, message, data) => {
            dbapi.saveDeviceStatus(message.serial, message.status)
            appDealer.send([channel, data])
        })
        .on(wire.DeviceReadyMessage, async(channel, message, data) => {
            await dbapi.setDeviceReady(message.serial, message.channel)
            devDealer.send([message.channel, wireutil.envelope(new wire.ProbeMessage())])
            appDealer.send([channel, data])
        })
        .on(wire.JoinGroupByAdbFingerprintMessage, async(channel, message, data) => {
            try {
                const user = await dbapi.lookupUserByAdbFingerprint(message.fingerprint)
                if (user) {
                    devDealer.send([
                        channel,
                        wireutil.envelope(new wire.AutoGroupMessage(new wire.OwnerMessage(user.email, user.name, user.group), message.fingerprint))
                    ])
                    return
                }
                appDealer.send([
                    message.currentGroup,
                    wireutil.envelope(new wire.JoinGroupByAdbFingerprintMessage(message.serial, message.fingerprint, message.comment))
                ])
            }
            catch (/** @type any */ err) {
                log.error('Unable to lookup user by ADB fingerprint "%s"', message.fingerprint, err.stack)
            }
        })
        .on(wire.JoinGroupByVncAuthResponseMessage, async(channel, message, data) => {
            try {
                const user = await dbapi.lookupUserByVncAuthResponse(message.response, message.serial)
                if (user) {
                    devDealer.send([
                        channel,
                        wireutil.envelope(new wire.AutoGroupMessage(new wire.OwnerMessage(user.email, user.name, user.group), message.response))
                    ])
                    return
                }

                appDealer.send([
                    message.currentGroup,
                    wireutil.envelope(new wire.JoinGroupByVncAuthResponseMessage(message.serial, message.response))
                ])
            }
            catch (/** @type any */ err) {
                log.error('Unable to lookup user by VNC auth response "%s"', message.response, err.stack)
            }
        })
        .on(wire.ConnectStartedMessage, async(channel, message, data) => {
            await dbapi.setDeviceConnectUrl(message.serial, message.url)
            appDealer.send([channel, data])
        })
        .on(wire.ConnectStoppedMessage, async(channel, message, data) => {
            await dbapi.unsetDeviceConnectUrl(message.serial)
            appDealer.send([channel, data])
        })
        .on(wire.JoinGroupMessage, async(channel, message, data) => {
            await Promise.all([
                dbapi.setDeviceOwner(message.serial, message.owner),

                message.usage &&
                    dbapi.setDeviceUsage(message.serial, message.usage),

                dbapi.sendEvent(`device_${message.usage || 'use'}`
                    , {}
                    , {deviceSerial: message.serial, userEmail: message.owner.email, groupId: message.owner.group}
                    , Date.now()
                )
            ])
            appDealer.send([channel, data])
        })
        .on(wire.LeaveGroupMessage, async(channel, message, data) => {
            await Promise.all([
                dbapi.unsetDeviceOwner(message.serial),
                dbapi.unsetDeviceUsage(message.serial),
                dbapi.sendEvent('device_leave'
                    , {}
                    , {deviceSerial: message.serial, userEmail: message.owner.email, groupId: message.owner.group}
                    , Date.now()
                )
            ])
            appDealer.send([channel, data])
        })
        .on(wire.DeviceIdentityMessage, (channel, message, data) => {
            dbapi.saveDeviceIdentity(message.serial, message)
            appDealer.send([channel, data])
        })
        .on(wire.AirplaneModeEvent, (channel, message, data) => {
            dbapi.setDeviceAirplaneMode(message.serial, message.enabled)
            appDealer.send([channel, data])
        })
        .on(wire.BatteryEvent, (channel, message, data) => {
            dbapi.setDeviceBattery(message.serial, message)
            appDealer.send([channel, data])
        })
        .on(wire.DeviceBrowserMessage, (channel, message, data) => {
            dbapi.setDeviceBrowser(message.serial, message)
            appDealer.send([channel, data])
        })
        .on(wire.ConnectivityEvent, (channel, message, data) => {
            dbapi.setDeviceConnectivity(message.serial, message)
            appDealer.send([channel, data])
        })
        .on(wire.PhoneStateEvent, (channel, message, data) => {
            dbapi.setDevicePhoneState(message.serial, message)
            appDealer.send([channel, data])
        })
        .on(wire.RotationEvent, (channel, message, data) => {
            dbapi.setDeviceRotation(message)
            appDealer.send([channel, data])
        })
        .on(wire.CapabilitiesMessage, (channel, message, data) => {
            dbapi.setDeviceCapabilities(message)
            appDealer.send([channel, data])
        })
        .on(wire.ReverseForwardsEvent, (channel, message, data) => {
            dbapi.setDeviceReverseForwards(message.serial, message.forwards)
            appDealer.send([channel, data])
        })
        .on(wire.SetDeviceDisplay, (channel, message, data) => {
            dbapi
                .setDeviceSocketDisplay(message)
                .then(function(response) {
                    log.info('setDeviceSocketDisplay response: %s', response)
                })
                .catch(function(err) {
                    log.error('setDeviceSocketDisplay', err)
                })
        })
        .on(wire.UpdateIosDevice, (channel, message, data) => {
            dbapi
                .updateIosDevice(message)
                .then(result => {
                    log.info('UpdateIosDevice: %s', result)
                })
                .catch(err => {
                    log.info(err)
                })
        })
        .on(wire.SdkIosVersion, (channel, message, data) => {
            dbapi
                .setDeviceIosVersion(message)
                .then(result => {
                    log.info('SdkIosVersion: %s', result)
                })
                .catch(err => {
                    log.info(err)
                })
        })
        .on(wire.SizeIosDevice, (channel, message, data) => {
            dbapi.sizeIosDevice(message.id, message.height, message.width, message.scale).then(result => {
                log.info('SizeIosDevice: %s', result)
            }).catch(err => {
                log.info(err)
            })
            appDealer.send([channel, data])
        })
        .on(wire.DeviceTypeMessage, (channel, message, data) => {
            dbapi.setDeviceType(message.serial, message.type)
        })
        .on(wire.DeleteDevice, (channel, message, data) => {
            dbapi.deleteDevice(message.serial)
        })
        .on(wire.SetAbsentDisconnectedDevices, (channel, message, data) => {
            dbapi.setAbsentDisconnectedDevices()
        })
        .on(wire.GetServicesAvailabilityMessage, (channel, message, data) => {
            dbapi.setDeviceServicesAvailability(message.serial, message)
            appDealer.send([channel, data])
        })
        .handler()

    devDealer.on('message', router)

    lifecycle.observe(function() {
        [appDealer, devDealer, push, pushdev, sub, subdev].forEach(function(sock) {
            try {
                sock.close()
            }
            catch (err) {
                log.error('Error while closing socket "%s"', err.stack)
            }
        })
    })
})
