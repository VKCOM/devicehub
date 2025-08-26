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
import {UpdateAccessTokenMessage, DeleteUserMessage, DeviceChangeMessage, UserChangeMessage, GroupChangeMessage, DeviceGroupChangeMessage, GroupUserChangeMessage, DeviceHeartbeatMessage, DeviceLogMessage, TransactionProgressMessage, TransactionDoneMessage, TransactionTreeMessage, InstallResultMessage, DeviceLogcatEntryMessage, TemporarilyUnavailableMessage, UpdateRemoteConnectUrl, InstalledApplications, DeviceIntroductionMessage, InitializeIosDeviceState, DevicePresentMessage, DeviceAbsentMessage, DeviceStatusMessage, DeviceReadyMessage, JoinGroupByAdbFingerprintMessage, JoinGroupByVncAuthResponseMessage, ConnectStartedMessage, ConnectStoppedMessage, JoinGroupMessage, LeaveGroupMessage, DeviceIdentityMessage, AirplaneModeEvent, BatteryEvent, DeviceBrowserMessage, ConnectivityEvent, PhoneStateEvent, RotationEvent, CapabilitiesMessage, ReverseForwardsEvent, SetDeviceDisplay, UpdateIosDevice, SdkIosVersion, SizeIosDevice, DeviceTypeMessage, DeleteDevice, SetAbsentDisconnectedDevices, GetServicesAvailabilityMessage} from '../../wire/wire.js'

export default await db.ensureConnectivity(async function(options) {
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
        .on(UpdateAccessTokenMessage, defaultWireHandler)
        .on(DeleteUserMessage, defaultWireHandler)
        .on(DeviceChangeMessage, defaultWireHandler)
        .on(UserChangeMessage, defaultWireHandler)
        .on(GroupChangeMessage, defaultWireHandler)
        .on(DeviceGroupChangeMessage, defaultWireHandler)
        .on(GroupUserChangeMessage, defaultWireHandler)
        .on(DeviceHeartbeatMessage, defaultWireHandler)
        .on(DeviceLogMessage, defaultWireHandler)
        .on(TransactionProgressMessage, defaultWireHandler)
        .on(TransactionDoneMessage, defaultWireHandler)
        .on(TransactionTreeMessage, defaultWireHandler)
        .on(InstallResultMessage, defaultWireHandler)
        .on(DeviceLogcatEntryMessage, defaultWireHandler)
        .on(TemporarilyUnavailableMessage, defaultWireHandler)
        .on(UpdateRemoteConnectUrl, defaultWireHandler)
        .on(InstalledApplications, defaultWireHandler)
        .on(DeviceIntroductionMessage, (channel, message, data) => {
            dbapi.saveDeviceInitialState(message.serial, message).then(function() {
                devDealer.send([
                    message.provider.channel,
                    wireutil.envelope(new wire.DeviceRegisteredMessage(message.serial))
                ])
                appDealer.send([channel, data])
            })
        })
        .on(InitializeIosDeviceState, (channel, message, data) => {
            dbapi.initializeIosDeviceState(options.publicIp, message)
        })
        .on(DevicePresentMessage, (channel, message, data) => {
            dbapi.setDevicePresent(message.serial)
            appDealer.send([channel, data])
        })
        .on(DeviceAbsentMessage, (channel, message, data) => {
            if (!message.applications) {
                dbapi.setDeviceAbsent(message.serial)
                appDealer.send([channel, data])
            }
        })
        .on(DeviceStatusMessage, (channel, message, data) => {
            dbapi.saveDeviceStatus(message.serial, message.status)
            appDealer.send([channel, data])
        })
        .on(DeviceReadyMessage, (channel, message, data) => {
            dbapi.setDeviceReady(message.serial, message.channel).then(function() {
                devDealer.send([message.channel, wireutil.envelope(new wire.ProbeMessage())])
                appDealer.send([channel, data])
            })
        })
        .on(JoinGroupByAdbFingerprintMessage, (channel, message, data) => {
            dbapi
                .lookupUserByAdbFingerprint(message.fingerprint)
                .then(function(user) {
                    if (user) {
                        devDealer.send([
                            channel,
                            wireutil.envelope(new wire.AutoGroupMessage(new wire.OwnerMessage(user.email, user.name, user.group), message.fingerprint))
                        ])
                    }
                    else if (message.currentGroup) {
                        appDealer.send([
                            message.currentGroup,
                            wireutil.envelope(new wire.JoinGroupByAdbFingerprintMessage(message.serial, message.fingerprint, message.comment))
                        ])
                    }
                })
                .catch(function(err) {
                    log.error('Unable to lookup user by ADB fingerprint "%s"', message.fingerprint, err.stack)
                })
        })
        .on(JoinGroupByVncAuthResponseMessage, (channel, message, data) => {
            dbapi
                .lookupUserByVncAuthResponse(message.response, message.serial)
                .then(function(user) {
                    if (user) {
                        devDealer.send([
                            channel,
                            wireutil.envelope(new wire.AutoGroupMessage(new wire.OwnerMessage(user.email, user.name, user.group), message.response))
                        ])
                    }
                    else if (message.currentGroup) {
                        appDealer.send([
                            message.currentGroup,
                            wireutil.envelope(new wire.JoinGroupByVncAuthResponseMessage(message.serial, message.response))
                        ])
                    }
                })
                .catch(function(err) {
                    log.error('Unable to lookup user by VNC auth response "%s"', message.response, err.stack)
                })
        })
        .on(ConnectStartedMessage, (channel, message, data) => {
            dbapi.setDeviceConnectUrl(message.serial, message.url)
            appDealer.send([channel, data])
        })
        .on(ConnectStoppedMessage, (channel, message, data) => {
            dbapi.unsetDeviceConnectUrl(message.serial)
            appDealer.send([channel, data])
        })
        .on(JoinGroupMessage, (channel, message, data) => {
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
        .on(LeaveGroupMessage, (channel, message, data) => {
            dbapi.unsetDeviceOwner(message.serial)
            dbapi.unsetDeviceUsage(message.serial)
            dbapi.sendEvent('device_leave'
                , {}
                , {deviceSerial: message.serial, userEmail: message.owner.email, groupId: message.owner.group}
                , Date.now()
            )
            appDealer.send([channel, data])
        })
        .on(DeviceIdentityMessage, (channel, message, data) => {
            dbapi.saveDeviceIdentity(message.serial, message)
            appDealer.send([channel, data])
        })
        .on(AirplaneModeEvent, (channel, message, data) => {
            dbapi.setDeviceAirplaneMode(message.serial, message.enabled)
            appDealer.send([channel, data])
        })
        .on(BatteryEvent, (channel, message, data) => {
            dbapi.setDeviceBattery(message.serial, message)
            appDealer.send([channel, data])
        })
        .on(DeviceBrowserMessage, (channel, message, data) => {
            dbapi.setDeviceBrowser(message.serial, message)
            appDealer.send([channel, data])
        })
        .on(ConnectivityEvent, (channel, message, data) => {
            dbapi.setDeviceConnectivity(message.serial, message)
            appDealer.send([channel, data])
        })
        .on(PhoneStateEvent, (channel, message, data) => {
            dbapi.setDevicePhoneState(message.serial, message)
            appDealer.send([channel, data])
        })
        .on(RotationEvent, (channel, message, data) => {
            dbapi.setDeviceRotation(message)
            appDealer.send([channel, data])
        })
        .on(CapabilitiesMessage, (channel, message, data) => {
            dbapi.setDeviceCapabilities(message)
            appDealer.send([channel, data])
        })
        .on(ReverseForwardsEvent, (channel, message, data) => {
            dbapi.setDeviceReverseForwards(message.serial, message.forwards)
            appDealer.send([channel, data])
        })
        .on(SetDeviceDisplay, (channel, message, data) => {
            dbapi
                .setDeviceSocketDisplay(message)
                .then(function(response) {
                    log.info('setDeviceSocketDisplay response', response)
                })
                .catch(function(err) {
                    log.error('setDeviceSocketDisplay', err)
                })
        })
        .on(UpdateIosDevice, (channel, message, data) => {
            dbapi
                .updateIosDevice(message)
                .then(result => {
                    log.info(result)
                })
                .catch(err => {
                    log.info(err)
                })
        })
        .on(SdkIosVersion, (channel, message, data) => {
            dbapi
                .setDeviceIosVersion(message)
                .then(result => {
                    log.info(result)
                })
                .catch(err => {
                    log.info(err)
                })
        })
        .on(SizeIosDevice, (channel, message, data) => {
            dbapi.sizeIosDevice(message.id, message.height, message.width, message.scale).then(result => {
                log.info(result)
            }).catch(err => {
                log.info(err)
            })
            appDealer.send([channel, data])
        })
        .on(DeviceTypeMessage, (channel, message, data) => {
            dbapi.setDeviceType(message.serial, message.type)
        })
        .on(DeleteDevice, (channel, message, data) => {
            dbapi.deleteDevice(message.serial)
        })
        .on(SetAbsentDisconnectedDevices, (channel, message, data) => {
            dbapi.setAbsentDisconnectedDevices()
        })
        .on(GetServicesAvailabilityMessage, (channel, message, data) => {
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
