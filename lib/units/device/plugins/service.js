// @ts-nocheck
import util from 'util'
import events from 'events'
import syrup from '@devicefarmer/stf-syrup'
import Promise from 'bluebird'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import devutil from '../../../util/devutil.js'
import keyutil from '../../../util/keyutil.js'
import * as streamutil from '../../../util/streamutil.js'
import logger from '../../../util/logger.js'
import * as ms from '../../../wire/messagestream.js'
import lifecycle from '../../../util/lifecycle.js'
import adb from '../support/adb.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import sdk from '../support/sdk.js'
import service from '../resources/service.js'
function MessageResolver() {
    this.resolvers = Object.create(null)
    this.await = function(id, resolver) {
        this.resolvers[id] = resolver
        return resolver.promise
    }
    this.resolve = function(id, value) {
        var resolver = this.resolvers[id]
        delete this.resolvers[id]
        resolver.resolve(value)
        return resolver.promise
    }
}
export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(push)
    .dependency(sdk)
    .dependency(service)
    .dependency(devutil)
    .define(async function(options, adb, router, push, sdk, apk, devutil) {
        var log = logger.createLogger('device:plugins:service')
        var messageResolver = new MessageResolver()
        var plugin = new events.EventEmitter()
        var agent = {
            socket: null,
            writer: null,
            sock: 'localabstract:stfagent'
        }
        var service = {
            socket: null,
            writer: null,
            reader: null,
            sock: 'localabstract:stfservice'
        }
        function stopAgent() {
            return devutil.killProcsByComm('stf.agent', 'stf.agent')
        }
        function callService(intent) {
            var startServiceCmd = (sdk.level < 26) ? 'startservice' : 'start-foreground-service'
            log.info('using \'%s\' command for API %s', startServiceCmd, sdk.level)
            return adb.getDevice(options.serial).shell(util.format('am %s --user 0 %s', startServiceCmd, intent))
                .then(function(out) {
                    return streamutil.findLine(out, /^Error/)
                        .finally(function() {
                            out.end()
                        })
                        .then(function(line) {
                            if (line.indexOf('--user') !== -1) {
                                let command = util.format('am %s %s', startServiceCmd, intent)
                                log.info('Stating service with command ' + command)
                                return adb.getDevice(options.serial).shell(command)
                                    .then(function() {
                                        return streamutil.findLine(out, /^Error/)
                                            .finally(function() {
                                                out.end()
                                            })
                                            .then(function(line) {
                                                throw new Error(util.format('Service had an error: "%s"', line))
                                            })
                                            .catch(streamutil.NoSuchLineError, function() {
                                                return true
                                            })
                                    })
                            }
                            else {
                                throw new Error(util.format('Service had an error: "%s"', line))
                            }
                        })
                        .catch(streamutil.NoSuchLineError, function() {
                            return true
                        })
                })
        }
        function prepareForServiceDeath(conn) {
            function endListener() {
                var startTime = Date.now()
                log.important('Service connection ended, attempting to relaunch')
                /* eslint no-use-before-define: 0 */
                openService()
                    // .timeout(5000)
                    .then(function() {
                        log.important('Service relaunched in %dms', Date.now() - startTime)
                    })
                    .catch(function(err) {
                        log.fatal('Service connection could not be relaunched', err.stack)
                        lifecycle.fatal()
                    })
            }
            conn.once('end', endListener)
            conn.on('error', function(err) {
                log.fatal('Service connection had an error', err.stack)
                lifecycle.fatal()
            })
        }
        function handleEnvelope(data) {
            var envelope = apk.wire.Envelope.decode(data)
            var message
            if (envelope.id !== null) {
                messageResolver.resolve(envelope.id, envelope.message)
            }
            else {
                switch (envelope.type) {
                case apk.wire.MessageType.EVENT_AIRPLANE_MODE:
                    message = apk.wire.AirplaneModeEvent.decode(envelope.message)
                    push.send([
                        wireutil.global,
                        wireutil.envelope(new wire.AirplaneModeEvent(options.serial, message.enabled))
                    ])
                    plugin.emit('airplaneModeChange', message)
                    break
                case apk.wire.MessageType.EVENT_BATTERY:
                    message = apk.wire.BatteryEvent.decode(envelope.message)
                    push.send([
                        wireutil.global,
                        wireutil.envelope(new wire.BatteryEvent(options.serial, message.status, message.health, message.source, message.level, message.scale, message.temp, message.voltage))
                    ])
                    plugin.emit('batteryChange', message)
                    break
                case apk.wire.MessageType.EVENT_BROWSER_PACKAGE:
                    message = apk.wire.BrowserPackageEvent.decode(envelope.message)
                    plugin.emit('browserPackageChange', message)
                    break
                case apk.wire.MessageType.EVENT_CONNECTIVITY:
                    message = apk.wire.ConnectivityEvent.decode(envelope.message)
                    push.send([
                        wireutil.global,
                        wireutil.envelope(new wire.ConnectivityEvent(options.serial, message.connected, message.type, message.subtype, message.failover, message.roaming))
                    ])
                    plugin.emit('connectivityChange', message)
                    break
                case apk.wire.MessageType.EVENT_PHONE_STATE:
                    message = apk.wire.PhoneStateEvent.decode(envelope.message)
                    push.send([
                        wireutil.global,
                        wireutil.envelope(new wire.PhoneStateEvent(options.serial, message.state, message.manual, message.operator))
                    ])
                    plugin.emit('phoneStateChange', message)
                    break
                case apk.wire.MessageType.EVENT_ROTATION:
                    message = apk.wire.RotationEvent.decode(envelope.message)
                    push.send([
                        wireutil.global,
                        wireutil.envelope(new wire.RotationEvent(options.serial, message.rotation))
                    ])
                    plugin.emit('rotationChange', message)
                    break
                }
            }
        }
        // The APK should be up to date at this point. If it was reinstalled, the
        // service should have been automatically stopped while it was happening.
        // So, we should be good to go.
        function openService() {
            log.info('Launching service')
            return callService(util.format("-a '%s' -n '%s'", apk.startIntent.action, apk.startIntent.component))
                .then(function() {
                    return devutil.waitForLocalSocket(service.sock)
                })
                .then(function(conn) {
                    service.socket = conn
                    service.reader = conn.pipe(new ms.DelimitedStream())
                    service.reader.on('data', handleEnvelope)
                    service.writer = new ms.DelimitingStream()
                    service.writer.pipe(conn)
                    return prepareForServiceDeath(conn)
                })
                .then(function() {
                    devutil.executeShellCommand('settings put system screen_brightness 0')
                    devutil.executeShellCommand('settings put system screen_brightness_mode 0')
                    devutil.executeShellCommand('input keyevent 26')
                })
        }
        function prepareForAgentDeath(conn) {
            function endListener() {
                var startTime = Date.now()
                log.important('Agent connection ended, attempting to relaunch')
                openService()
                    // .timeout(5000)
                    .then(function() {
                        log.important('Agent relaunched in %dms', Date.now() - startTime)
                    })
                    .catch(function(err) {
                        log.fatal('Agent connection could not be relaunched', err.stack)
                        lifecycle.fatal()
                    })
            }
            conn.once('end', endListener)
            conn.on('error', function(err) {
                log.fatal('Agent connection had an error', err.stack)
                lifecycle.fatal()
            })
        }
        async function openAgent() {
            log.info('Launching agent')
            await stopAgent()
            await devutil.ensureUnusedLocalSocket(agent.sock)
            const out = await adb.getDevice(options.serial).shell(util.format("CLASSPATH='%s' exec app_process /system/bin '%s'", apk.path, apk.main))
            streamutil.talk(log, 'Agent says: "%s"', out)
            const conn = await devutil.waitForLocalSocket(agent.sock)
            agent.socket = conn
            agent.writer = new ms.DelimitingStream()
            agent.writer.pipe(conn)
            return prepareForAgentDeath(conn)
        }
        function runAgentCommand(type, cmd) {
            agent.writer.write(new apk.wire.Envelope(null, type, cmd.encodeNB()).encodeNB())
        }
        function keyEvent(data) {
            return runAgentCommand(apk.wire.MessageType.DO_KEYEVENT, new apk.wire.KeyEventRequest(data))
        }
        plugin.type = function(text) {
            devutil.executeShellCommand("am broadcast -a ADB_INPUT_TEXT --es msg '" + text + "'")
        }
        plugin.paste = function(text) {
            return plugin.setClipboard(text)
                .delay(500) // Give it a little bit of time to settle.
                .then(function() {
                    keyEvent({
                        event: apk.wire.KeyEvent.PRESS,
                        keyCode: adb.Keycode.KEYCODE_V,
                        ctrlKey: true
                    })
                })
        }
        plugin.copy = function() {
        // @TODO Not sure how to force the device to copy the current selection
        // yet.
            return plugin.getClipboard()
        }
        function runServiceCommand(type, cmd) {
            var resolver = Promise.defer()
            var id = Math.floor(Math.random() * 0xFFFFFF)
            service.writer.write(new apk.wire.Envelope(id, type, cmd.encodeNB()).encodeNB())
            return messageResolver.await(id, resolver)
        }
        plugin.getDisplay = function(id) {
            return runServiceCommand(apk.wire.MessageType.GET_DISPLAY, new apk.wire.GetDisplayRequest(id))
                .then(function(data) {
                    var response = apk.wire.GetDisplayResponse.decode(data)
                    if (response.success) {
                        return {
                            id: id,
                            width: response.width,
                            height: response.height,
                            xdpi: response.xdpi,
                            ydpi: response.ydpi,
                            fps: response.fps,
                            density: response.density,
                            rotation: response.rotation,
                            secure: response.secure,
                            size: Math.sqrt(Math.pow(response.width / response.xdpi, 2) +
                        Math.pow(response.height / response.ydpi, 2))
                        }
                    }
                    throw new Error('Unable to retrieve display information')
                })
        }
        plugin.wake = function() {
            return runAgentCommand(apk.wire.MessageType.DO_WAKE, new apk.wire.DoWakeRequest())
        }
        plugin.rotate = function(rotation) {
            return runAgentCommand(apk.wire.MessageType.SET_ROTATION, new apk.wire.SetRotationRequest(rotation, true))
        }
        plugin.freezeRotation = function(rotation) {
            return runAgentCommand(apk.wire.MessageType.SET_ROTATION, new apk.wire.SetRotationRequest(rotation, true))
        }
        plugin.thawRotation = function() {
            return runAgentCommand(apk.wire.MessageType.SET_ROTATION, new apk.wire.SetRotationRequest(0, false))
        }
        plugin.version = function() {
            return runServiceCommand(apk.wire.MessageType.GET_VERSION, new apk.wire.GetVersionRequest())
                .then(function(data) {
                    var response = apk.wire.GetVersionResponse.decode(data)
                    if (response.success) {
                        return response.version
                    }
                    throw new Error('Unable to retrieve version')
                })
        }
        plugin.unlock = function() {
            return runServiceCommand(apk.wire.MessageType.SET_KEYGUARD_STATE, new apk.wire.SetKeyguardStateRequest(false))
                .then(function(data) {
                    var response = apk.wire.SetKeyguardStateResponse.decode(data)
                    if (!response.success) {
                        throw new Error('Unable to unlock device')
                    }
                })
        }
        plugin.lock = function() {
            return runServiceCommand(apk.wire.MessageType.SET_KEYGUARD_STATE, new apk.wire.SetKeyguardStateRequest(true))
                .then(function(data) {
                    var response = apk.wire.SetKeyguardStateResponse.decode(data)
                    if (!response.success) {
                        throw new Error('Unable to lock device')
                    }
                })
        }
        plugin.acquireWakeLock = function() {
            return runServiceCommand(apk.wire.MessageType.SET_WAKE_LOCK, new apk.wire.SetWakeLockRequest(true))
                .then(function(data) {
                    var response = apk.wire.SetWakeLockResponse.decode(data)
                    if (!response.success) {
                        throw new Error('Unable to acquire WakeLock')
                    }
                })
        }
        plugin.releaseWakeLock = function() {
            return runServiceCommand(apk.wire.MessageType.SET_WAKE_LOCK, new apk.wire.SetWakeLockRequest(false))
                .then(function(data) {
                    var response = apk.wire.SetWakeLockResponse.decode(data)
                    if (!response.success) {
                        throw new Error('Unable to release WakeLock')
                    }
                })
        }
        plugin.identity = function() {
            log.info('Calling Do Identify gRPC')
            return runServiceCommand(apk.wire.MessageType.DO_IDENTIFY, new apk.wire.DoIdentifyRequest(options.serial))
                .then(function(data) {
                    let response = apk.wire.DoIdentifyResponse.decode(data)
                    if (!response.success) {
                        throw new Error('Unable to identify device')
                    }
                })
        }
        plugin.setClipboard = function(text) {
            return runServiceCommand(apk.wire.MessageType.SET_CLIPBOARD, new apk.wire.SetClipboardRequest(apk.wire.ClipboardType.TEXT, text))
                .then(function(data) {
                    var response = apk.wire.SetClipboardResponse.decode(data)
                    if (!response.success) {
                        throw new Error('Unable to set clipboard')
                    }
                })
        }
        plugin.getClipboard = function() {
            return runServiceCommand(apk.wire.MessageType.GET_CLIPBOARD, new apk.wire.GetClipboardRequest(apk.wire.ClipboardType.TEXT))
                .then(function(data) {
                    var response = apk.wire.GetClipboardResponse.decode(data)
                    if (response.success) {
                        switch (response.type) {
                        case apk.wire.ClipboardType.TEXT:
                            return response.text
                        }
                    }
                    throw new Error('Unable to get clipboard')
                })
        }
        plugin.getBrowsers = function() {
            return runServiceCommand(apk.wire.MessageType.GET_BROWSERS, new apk.wire.GetBrowsersRequest())
                // .timeout(15000)
                .then(function(data) {
                    var response = apk.wire.GetBrowsersResponse.decode(data)
                    if (response.success) {
                        delete response.success
                        return response
                    }
                    throw new Error('Unable to get browser list')
                })
        }
        plugin.getMobileServices = function() {
            return runServiceCommand(apk.wire.MessageType.GET_SERVICES, new apk.wire.GetServicesAvailabilityRequest())
                // .timeout(15000)
                .then(function(data) {
                    let response = apk.wire.GetServicesAvailabilityResponse.decode(data)
                    if (response.success) {
                        delete response.success
                        return response
                    }
                    throw new Error('Unable to get mobile services')
                })
        }
        plugin.getProperties = function(properties) {
            return runServiceCommand(apk.wire.MessageType.GET_PROPERTIES, new apk.wire.GetPropertiesRequest(properties))
                // .timeout(200000)
                .then(function(data) {
                    let response = apk.wire.GetPropertiesResponse.decode(data)
                    if (response.success) {
                        let mapped = {}
                        response.properties.forEach(function(property) {
                            mapped[property.name] = property.value
                        })
                        if (!mapped.imei) {
                            return adb.getDevice(options.serial).getProperties()
                                .then((props) => {
                                    let sdk = props['ro.build.version.sdk']
                                    let command
                                    if (sdk >= 24) {
                                        command = "service call iphonesubinfo 1 | awk -F \"'\" '{print $2}' | sed '1 d' | tr -d '.' | awk '{print}' ORS= | xargs echo imei:"
                                    }
                                    else {
                                        command = 'service call iphonesubinfo 1 | cut -c 52-66 | tr -d \'.[:space:]\' | xargs echo imei:'
                                    }
                                    return adb.getDevice(options.serial).shell(command)
                                        .then((out) => {
                                            return streamutil.findLine(out, (/^imei:/))
                                                // .timeout(15000)
                                                .then(function(line) {
                                                    let splitedLine = line.split('imei: ')
                                                    if (splitedLine.length > 1) {
                                                        mapped.imei = line.split('imei: ')[1]
                                                    }
                                                    else {
                                                        mapped.imei = 'secured'
                                                    }
                                                    return mapped
                                                })
                                        })
                                        .catch((e) => {
                                            log.error(e)
                                            log.info('setting secured imei because of error')
                                            mapped.imei = 'secured'
                                            return mapped
                                        })
                                })
                        }
                        else {
                            return mapped
                        }
                    }
                    throw new Error('Unable to get properties')
                })
        }
        plugin.getAccounts = function(data) {
            return runServiceCommand(apk.wire.MessageType.GET_ACCOUNTS, new apk.wire.GetAccountsRequest({type: data.type}))
                // .timeout(15000)
                .then(function(data) {
                    var response = apk.wire.GetAccountsResponse.decode(data)
                    if (response.success) {
                        return response.accounts
                    }
                    throw new Error('No accounts returned')
                })
        }
        plugin.removeAccount = function(data) {
            return runServiceCommand(apk.wire.MessageType.DO_REMOVE_ACCOUNT, new apk.wire.DoRemoveAccountRequest({
                type: data.type,
                account: data.account
            }))
                // .timeout(15000)
                .then(function(data) {
                    var response = apk.wire.DoRemoveAccountResponse.decode(data)
                    if (response.success) {
                        return true
                    }
                    throw new Error('Unable to remove account')
                })
        }
        plugin.addAccountMenu = function() {
            return runServiceCommand(apk.wire.MessageType.DO_ADD_ACCOUNT_MENU, new apk.wire.DoAddAccountMenuRequest())
                // .timeout(15000)
                .then(function(data) {
                    var response = apk.wire.DoAddAccountMenuResponse.decode(data)
                    if (response.success) {
                        return true
                    }
                    throw new Error('Unable to show add account menu')
                })
        }
        plugin.cleanupBondedBluetoothDevices = function() {
            return runServiceCommand(apk.wire.MessageType.DO_CLEAN_BLUETOOTH_BONDED_DEVICES, new apk.wire.DoCleanBluetoothBondedDevicesRequest())
                // .timeout(15000)
                .then(function(data) {
                    var response = apk.wire.DoCleanBluetoothBondedDevicesResponse.decode(data)
                    if (response.success) {
                        return true
                    }
                    throw new Error('Unable to clean bluetooth bonded devices')
                })
        }
        plugin.setRingerMode = function(mode) {
            return runServiceCommand(apk.wire.MessageType.SET_RINGER_MODE, new apk.wire.SetRingerModeRequest(mode))
                .then(function(data) {
                    var response = apk.wire.SetRingerModeResponse.decode(data)
                    if (!response.success) {
                        throw new Error('Unable to set ringer mode')
                    }
                })
        }
        plugin.getRingerMode = function() {
            return runServiceCommand(apk.wire.MessageType.GET_RINGER_MODE, new apk.wire.GetRingerModeRequest())
                .then(function(data) {
                    var response = apk.wire.GetRingerModeResponse.decode(data)
                    // Reflection to decode enums to their string values, otherwise
                    // we only get an integer
                    var ringerMode = apk.builder.lookup('jp.co.cyberagent.stf.proto.RingerMode')
                        .children[response.mode].name
                    if (response.success) {
                        return ringerMode
                    }
                    throw new Error('Unable to get ringer mode')
                })
        }
        plugin.setWifiEnabled = function(enabled) {
            return runServiceCommand(apk.wire.MessageType.SET_WIFI_ENABLED, new apk.wire.SetWifiEnabledRequest(enabled))
                .then(function(data) {
                    var response = apk.wire.SetWifiEnabledResponse.decode(data)
                    if (!response.success) {
                        throw new Error('Unable to set Wifi')
                    }
                })
        }
        plugin.getWifiStatus = function() {
            return runServiceCommand(apk.wire.MessageType.GET_WIFI_STATUS, new apk.wire.GetWifiStatusRequest())
                .then(function(data) {
                    var response = apk.wire.GetWifiStatusResponse.decode(data)
                    if (response.success) {
                        return response.status
                    }
                    throw new Error('Unable to get Wifi status')
                })
        }
        plugin.sendCommand = function(command) {
            log.info('Executing shell command ' + command + ' on ' + options.serial)
            devutil.executeShellCommand(command)
        }
        plugin.setBluetoothEnabled = function(enabled) {
            return runServiceCommand(apk.wire.MessageType.SET_BLUETOOTH_ENABLED, new apk.wire.SetBluetoothEnabledRequest(enabled))
                // .timeout(10000)
                .then(function(data) {
                    var response = apk.wire.SetBluetoothEnabledResponse.decode(data)
                    if (!response.success) {
                        throw new Error('Unable to set Bluetooth')
                    }
                })
        }
        plugin.cleanBluetoothBonds = function() {
            return runServiceCommand(apk.wire.MessageType.DO_CLEAN_BLUETOOTH_BONDED_DEVICES, new apk.wire.DoCleanBluetoothBondedDevicesRequest())
                // .timeout(10000)
                .then(function(data) {
                    var response = apk.wire.DoCleanBluetoothBondedDevicesResponse.decode(data)
                    if (!response.success) {
                        throw new Error('Unable to clean Bluetooth bonded devices')
                    }
                })
        }
        plugin.getBluetoothStatus = function() {
            return runServiceCommand(apk.wire.MessageType.GET_BLUETOOTH_STATUS, new apk.wire.GetBluetoothStatusRequest())
                // .timeout(10000)
                .then(function(data) {
                    var response = apk.wire.GetBluetoothStatusResponse.decode(data)
                    if (response.success) {
                        return response.status
                    }
                    throw new Error('Unable to get Bluetooth status')
                })
        }
        plugin.getSdStatus = function() {
            return runServiceCommand(apk.wire.MessageType.GET_SD_STATUS, new apk.wire.GetSdStatusRequest())
                .then(function(data) {
                    var response = apk.wire.GetSdStatusResponse.decode(data)
                    if (response.success) {
                        return response.mounted
                    }
                    throw new Error('Unable to get SD card status')
                })
        }
        plugin.pressKey = function(key) {
            keyEvent({event: apk.wire.KeyEvent.PRESS, keyCode: keyutil.namedKey(key)})
            return Promise.resolve(true)
        }
        plugin.setMasterMute = function(mode) {
            return runServiceCommand(apk.wire.MessageType.SET_MASTER_MUTE, new apk.wire.SetMasterMuteRequest(mode))
                .then(function(data) {
                    var response = apk.wire.SetMasterMuteResponse.decode(data)
                    if (!response.success) {
                        throw new Error('Unable to set master mute')
                    }
                })
        }
        plugin.unlockDevice = async function() {
            devutil.executeShellCommand('input text ' + options.deviceCode).then(() => {
                devutil.executeShellCommand('input keyevent 66')
            })
        }

        await openAgent()
            .then(openService)
            .then(function() {
                router
                    .on(wire.PhysicalIdentifyMessage, function(channel) {
                        var reply = wireutil.reply(options.serial)
                        plugin.identity()
                        push.send([
                            channel,
                            reply.okay()
                        ])
                    })
                    .on(wire.KeyDownMessage, function(channel, message) {
                        try {
                            keyEvent({
                                event: apk.wire.KeyEvent.DOWN,
                                keyCode: keyutil.namedKey(message.key)
                            })
                        }
                        catch (e) {
                            log.warn(e.message)
                        }
                    })
                    .on(wire.KeyUpMessage, function(channel, message) {
                        try {
                            keyEvent({
                                event: apk.wire.KeyEvent.UP,
                                keyCode: keyutil.namedKey(message.key)
                            })
                        }
                        catch (e) {
                            log.warn(e.message)
                        }
                    })
                    .on(wire.KeyPressMessage, function(channel, message) {
                        try {
                            keyEvent({
                                event: apk.wire.KeyEvent.PRESS,
                                keyCode: keyutil.namedKey(message.key)
                            })
                        }
                        catch (e) {
                            log.warn(e.message)
                        }
                    })
                    .on(wire.TypeMessage, function(channel, message) {
                        plugin.type(message.text)
                    })
                    .on(wire.RotateMessage, function(channel, message) {
                        plugin.rotate(message.rotation)
                    })
                    .on(wire.UnlockDeviceMessage, function(channel, message) {
                        plugin.unlockDevice()
                    })
            })
        return plugin
    })
