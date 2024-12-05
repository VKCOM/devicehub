import Promise from 'bluebird'
import logger from '../../util/logger.js'
import wire from '../../wire/index.js'
import wirerouter from '../../wire/router.js'
import wireutil from '../../wire/util.js'
import * as db from '../../db/index.js'
import * as dbapi from '../../db/api.js'
import lifecycle from '../../util/lifecycle.js'
import srv from '../../util/srv.js'
import * as zmqutil from '../../util/zmqutil.js'
import {loadDeviceBySerial} from '../../db/api.js'
export default db.ensureConnectivity(function(options) {
    const log = logger.createLogger('processor')
    if (options.name) {
        logger.setGlobalIdentifier(options.name)
    }
    // App side
    var appDealer = zmqutil.socket('dealer')
    Promise.map(options.endpoints.appDealer, function(endpoint) {
        return srv.resolve(endpoint).then(function(records) {
            return srv.attempt(records, function(record) {
                log.info('App dealer connected to "%s"', record.url)
                appDealer.connect(record.url)
                return Promise.resolve(true)
            })
        })
    }).catch(function(err) {
        log.fatal('Unable to connect to app dealer endpoint', err)
        lifecycle.fatal()
    })
    // Device side
    var devDealer = zmqutil.socket('dealer')
    appDealer.on('message', function(channel, data) {
        devDealer.send([channel, data])
    })
    Promise.map(options.endpoints.devDealer, function(endpoint) {
        return srv.resolve(endpoint).then(function(records) {
            return srv.attempt(records, function(record) {
                log.info('Device dealer connected to "%s"', record.url)
                devDealer.connect(record.url)
                return Promise.resolve(true)
            })
        })
    }).catch(function(err) {
        log.fatal('Unable to connect to dev dealer endpoint', err)
        lifecycle.fatal()
    })
    devDealer.on('message', wirerouter()
        .on(wire.DeviceIntroductionMessage, function(channel, message, data) {
            dbapi.saveDeviceInitialState(message.serial, message).then(function() {
                devDealer.send([
                    message.provider.channel
                    , wireutil.envelope(new wire.DeviceRegisteredMessage(message.serial))
                ])
                appDealer.send([channel, data])
            })
        })
        .on(wire.UpdateAccessTokenMessage, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        .on(wire.DeleteUserMessage, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        .on(wire.DeviceChangeMessage, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        .on(wire.UserChangeMessage, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        .on(wire.GroupChangeMessage, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        .on(wire.DeviceGroupChangeMessage, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        .on(wire.GroupUserChangeMessage, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        .on(wire.InitializeIosDeviceState, function(channel, message, data) {
            dbapi.initializeIosDeviceState(options.publicIp, message)
        })
        // Workerless messages
        .on(wire.DevicePresentMessage, function(channel, message, data) {
            dbapi.setDevicePresent(message.serial)
            appDealer.send([channel, data])
        })
        .on(wire.DeviceAbsentMessage, function(channel, message, data) {
            if (!message.applications) {
                dbapi.setDeviceAbsent(message.serial)
                appDealer.send([channel, data])
            }
        })
        .on(wire.DeviceStatusMessage, function(channel, message, data) {
            dbapi.saveDeviceStatus(message.serial, message.status)
            appDealer.send([channel, data])
        })
        .on(wire.DeviceHeartbeatMessage, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        // Worker initialized
        .on(wire.DeviceReadyMessage, function(channel, message, data) {
            dbapi.setDeviceReady(message.serial, message.channel).then(function() {
                devDealer.send([message.channel, wireutil.envelope(new wire.ProbeMessage())])
                appDealer.send([channel, data])
            })
        })
        .on(wire.DeviceOnInstAppMessage, function(channel, message) {
            dbapi
                .getInstalledApplications(message)
                .then(device => {
                    log.info('DeviceOnInstAppMessage, channel : ', channel)
                    log.info('DeviceOnInstAppMessage, channel : ', new Buffer(device.channel))
                    const {installedApps} = device
                    appDealer.send([
                        new Buffer(device.owner.group)
                        , wireutil.envelope(new wire.InstalledApplications(message.serial, wireutil.toInstalledApps(installedApps)))
                    ])
                })
                .catch(err => {
                    log.error(err)
                })
        })
        // Worker messages
        .on(wire.JoinGroupByAdbFingerprintMessage, function(channel, message) {
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
        .on(wire.JoinGroupByVncAuthResponseMessage, function(channel, message) {
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
        .on(wire.ConnectStartedMessage, function(channel, message, data) {
            dbapi.setDeviceConnectUrl(message.serial, message.url)
            appDealer.send([channel, data])
        })
        .on(wire.ConnectStoppedMessage, function(channel, message, data) {
            dbapi.unsetDeviceConnectUrl(message.serial)
            appDealer.send([channel, data])
        })
        .on(wire.JoinGroupMessage, function(channel, message, data) {
            dbapi.setDeviceOwner(message.serial, message.owner)
            if (message.usage) {
                dbapi.setDeviceUsage(message.serial, message.usage)
            }
            appDealer.send([channel, data])
        })
        .on(wire.LeaveGroupMessage, function(channel, message, data) {
            dbapi.unsetDeviceOwner(message.serial, message.owner)
            dbapi.unsetDeviceUsage(message.serial)
            appDealer.send([channel, data])
        })
        .on(wire.DeviceLogMessage, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        .on(wire.DeviceIdentityMessage, function(channel, message, data) {
            dbapi.saveDeviceIdentity(message.serial, message)
            appDealer.send([channel, data])
        })
        .on(wire.TransactionProgressMessage, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        .on(wire.TransactionDoneMessage, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        .on(wire.TransactionTreeMessage, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        .on(wire.InstallResultMessage, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        .on(wire.DeviceLogcatEntryMessage, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        .on(wire.TemporarilyUnavailableMessage, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        .on(wire.UpdateRemoteConnectUrl, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        .on(wire.InstalledApplications, function(channel, message, data) {
            appDealer.send([channel, data])
        })
        .on(wire.AirplaneModeEvent, function(channel, message, data) {
            dbapi.setDeviceAirplaneMode(message.serial, message.enabled)
            appDealer.send([channel, data])
        })
        .on(wire.BatteryEvent, function(channel, message, data) {
            dbapi.setDeviceBattery(message.serial, message)
            appDealer.send([channel, data])
        })
        .on(wire.DeviceBrowserMessage, function(channel, message, data) {
            dbapi.setDeviceBrowser(message.serial, message)
            appDealer.send([channel, data])
        })
        .on(wire.ConnectivityEvent, function(channel, message, data) {
            dbapi.setDeviceConnectivity(message.serial, message)
            appDealer.send([channel, data])
        })
        .on(wire.PhoneStateEvent, function(channel, message, data) {
            dbapi.setDevicePhoneState(message.serial, message)
            appDealer.send([channel, data])
        })
        .on(wire.RotationEvent, function(channel, message, data) {
            dbapi.setDeviceRotation(message)
            appDealer.send([channel, data])
        })
        .on(wire.ReverseForwardsEvent, function(channel, message, data) {
            dbapi.setDeviceReverseForwards(message.serial, message.forwards)
            appDealer.send([channel, data])
        })
        .on(wire.SetDeviceDisplay, function(channel, message, data) {
            dbapi
                .setDeviceSocketDisplay(message)
                .then(function(response) {
                    log.info('setDeviceSocketDisplay response', response)
                })
                .catch(function(err) {
                    log.error('setDeviceSocketDisplay', err)
                })
        })
        .on(wire.UpdateIosDevice, function(channel, message, data) {
            dbapi
                .updateIosDevice(message)
                .then(result => {
                    log.info(result)
                })
                .catch(err => {
                    log.info(err)
                })
        })
        .on(wire.SdkIosVersion, function(channel, message, data) {
            dbapi
                .setDeviceIosVersion(message)
                .then(result => {
                    log.info(result)
                })
                .catch(err => {
                    log.info(err)
                })
        })
        .on(wire.SizeIosDevice, function(channel, message, data) {
            dbapi.sizeIosDevice(message.id, message.height, message.width, message.scale).then(result => {
                log.info(result)
            }).catch(err => {
                log.info(err)
            })
            appDealer.send([channel, data])
        })
        .on(wire.DeviceTypeMessage, function(channel, message, data) {
            dbapi.setDeviceType(message.serial, message.type)
        })
        .on(wire.DeleteDevice, function(channel, message) {
            dbapi.deleteDevice(message.serial)
        })
        .on(wire.SetAbsentDisconnectedDevices, function(channel, message) {
            dbapi.setAbsentDisconnectedDevices()
        })

        /* .on(wire.SetDeviceApp, function(channel, message) {
          dbapi
            .setDeviceApp(message)
            .then(result => {
              const {removePathApp} = result
              if (removePathApp !== '') {
                rimraf.sync(removePathApp)
              }
            })
            .catch(err => {
              log.error(err)
            })
        }) */
        .on(wire.GetServicesAvailabilityMessage, function(channel, message, data) {
            dbapi.setDeviceServicesAvailability(message.serial, message)
            appDealer.send([channel, data])
        })
        .handler())
    lifecycle.observe(function() {
        [appDealer, devDealer].forEach(function(sock) {
            try {
                sock.close()
            }
            catch (err) {
                // No-op
            }
        })
    })
})
