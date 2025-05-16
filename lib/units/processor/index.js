import Promise from 'bluebird'
import logger from '../../util/logger.js'
import wire from '../../wire/index.js'
import {WireRouter} from '../../wire/router.js'
import wireutil from '../../wire/util.js'
import db from '../../db/index.js'
import dbapi from '../../db/api.js'
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
    await db.connect(push, pushdev, channelRouter)

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
        .on(wire.DeviceIntroductionMessage, (channel, message, data) => {
            dbapi.saveDeviceInitialState(message.serial, message).then(function() {
                devDealer.send([
                    message.provider.channel
                    , wireutil.envelope(new wire.DeviceRegisteredMessage(message.serial))
                ])
                appDealer.send([channel, data])
            })
        })
        .on(wire.InitializeIosDeviceState, (channel, message, data) => {
            dbapi.initializeIosDeviceState(options.publicIp, message)
        })
        .on(wire.DevicePresentMessage, (channel, message, data) => {
            dbapi.setDevicePresent(message.serial)
            appDealer.send([channel, data])
        })
        .on(wire.DeviceAbsentMessage, (channel, message, data) => {
            if (!message.applications) {
                dbapi.setDeviceAbsent(message.serial)
                appDealer.send([channel, data])
            }
        })
        .on(wire.DeviceStatusMessage, (channel, message, data) => {
            dbapi.saveDeviceStatus(message.serial, message.status)
            appDealer.send([channel, data])
        })
        .on(wire.DeviceReadyMessage, (channel, message, data) => {
            dbapi.setDeviceReady(message.serial, message.channel).then(function() {
                devDealer.send([message.channel, wireutil.envelope(new wire.ProbeMessage())])
                appDealer.send([channel, data])
            })
        })
        .on(wire.JoinGroupByAdbFingerprintMessage, (channel, message, data) => {
            dbapi
                .lookupUserByAdbFingerprint(message.fingerprint)
                .then(function(user) {
                    if (user) {
                        devDealer.send([
                            channel
                            , wireutil.envelope(new wire.AutoGroupMessage(new wire.OwnerMessage(user.email, user.name, user.group), message.fingerprint))
                        ])
                    }
                    else if (message.currentGroup) {
                        appDealer.send([
                            message.currentGroup
                            , wireutil.envelope(new wire.JoinGroupByAdbFingerprintMessage(message.serial, message.fingerprint, message.comment))
                        ])
                    }
                })
                .catch(function(err) {
                    log.error('Unable to lookup user by ADB fingerprint "%s"', message.fingerprint, err.stack)
                })
        })
        .on(wire.JoinGroupByVncAuthResponseMessage, (channel, message, data) => {
            dbapi
                .lookupUserByVncAuthResponse(message.response, message.serial)
                .then(function(user) {
                    if (user) {
                        devDealer.send([
                            channel
                            , wireutil.envelope(new wire.AutoGroupMessage(new wire.OwnerMessage(user.email, user.name, user.group), message.response))
                        ])
                    }
                    else if (message.currentGroup) {
                        appDealer.send([
                            message.currentGroup
                            , wireutil.envelope(new wire.JoinGroupByVncAuthResponseMessage(message.serial, message.response))
                        ])
                    }
                })
                .catch(function(err) {
                    log.error('Unable to lookup user by VNC auth response "%s"', message.response, err.stack)
                })
        })
        .on(wire.ConnectStartedMessage, (channel, message, data) => {
            dbapi.setDeviceConnectUrl(message.serial, message.url)
            appDealer.send([channel, data])
        })
        .on(wire.ConnectStoppedMessage, (channel, message, data) => {
            dbapi.unsetDeviceConnectUrl(message.serial)
            appDealer.send([channel, data])
        })
        .on(wire.JoinGroupMessage, (channel, message, data) => {
            dbapi.setDeviceOwner(message.serial, message.owner)
            if (message.usage) {
                dbapi.setDeviceUsage(message.serial, message.usage)
            }

            const deviceUsage = message?.usage ? `device_${message.usage}` : 'device_use'
            dbapi.sendEvent(deviceUsage
                , {}
                , {deviceSerial: message.serial, userEmail: message.owner.email, groupId: message.owner.group}
                , Date.now()
            )

            appDealer.send([channel, data])
        })
        .on(wire.LeaveGroupMessage, (channel, message, data) => {
            dbapi.unsetDeviceOwner(message.serial)
            dbapi.unsetDeviceUsage(message.serial)
            dbapi.sendEvent('device_leave'
                , {}
                , {deviceSerial: message.serial, userEmail: message.owner.email, groupId: message.owner.group}
                , Date.now()
            )
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
                    log.info('setDeviceSocketDisplay response', response)
                })
                .catch(function(err) {
                    log.error('setDeviceSocketDisplay', err)
                })
        })
        .on(wire.UpdateIosDevice, (channel, message, data) => {
            dbapi
                .updateIosDevice(message)
                .then(result => {
                    log.info(result)
                })
                .catch(err => {
                    log.info(err)
                })
        })
        .on(wire.SdkIosVersion, (channel, message, data) => {
            dbapi
                .setDeviceIosVersion(message)
                .then(result => {
                    log.info(result)
                })
                .catch(err => {
                    log.info(err)
                })
        })
        .on(wire.SizeIosDevice, (channel, message, data) => {
            dbapi.sizeIosDevice(message.id, message.height, message.width, message.scale).then(result => {
                log.info(result)
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
                // No-op
            }
        })
    })
})
