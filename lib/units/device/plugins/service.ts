import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
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
import {Duplex} from 'node:stream'
import EventEmitter from 'events'
import {GRPC_WAIT_TIMEOUT} from '../../../util/apiutil.js'

interface Service {
    socket: Duplex | null
    writer: ms.DelimitingStream | null
    reader?: ms.DelimitedStream | null
    sock: string
}

class Deferred<T = any> {
    promise: Promise<T>
    resolve!: (value: T | PromiseLike<T>) => void
    reject!: (reason?: any) => void

    timeout = setTimeout(
        this.reject || (() => {}),
        GRPC_WAIT_TIMEOUT,
        new Error('Timeout')
    )

    constructor() {
        this.promise = new Promise<T>((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
        }).then((result) => {
            clearTimeout(this.timeout)
            return result
        })
    }
}

class MessageResolver {
    resolvers: Record<number, Deferred> = {}

    await = (id: number, resolver: Deferred) => {
        this.resolvers[id] = resolver
        return resolver.promise
    }

    resolve = (id: number, value: any) => {
        if (!this.resolvers[id]) {
            return
        }

        const {resolve, promise} = this.resolvers[id]
        resolve(value)
        delete this.resolvers[id]
        return promise
    }
}

export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(push)
    .dependency(sdk)
    .dependency(service)
    .dependency(devutil)
    .define(async(options, adb, router, push, sdk, apk, devutil) => {
        const log = logger.createLogger('device:plugins:service')
        const messageResolver = new MessageResolver()
        const agent: Service = {
            socket: null,
            writer: null,
            sock: 'localabstract:stfagent'
        }

        const service: Service = {
            socket: null,
            writer: null,
            reader: null,
            sock: 'localabstract:stfservice'
        }

        const stopAgent = () =>
            devutil.killProcsByComm('stf.agent', 'stf.agent')

        const callService = async(intent: string) => {
            const startServiceCmd = sdk.level < 26 ?
                'startservice' :
                'start-foreground-service'

            log.info('using \'%s\' command for API %s', startServiceCmd, sdk.level)

            let out: Duplex | null = null
            try {
                out = await adb.getDevice(options.serial).shell(util.format('am %s --user 0 %s', startServiceCmd, intent))
                const line = await streamutil.findLine(out, /^Error/) // reject if no errors in stdout
                if (!line?.includes('--user')) {
                    throw new Error(util.format('[first attempt] Service had an error: "%s"', line))
                }
            }
            catch (err: any) {
                if (err instanceof streamutil.NoSuchLineError) { // success
                    return true
                }
                throw err
            }
            finally {
                out?.end()
            }


            let command = util.format('am %s %s', startServiceCmd, intent)
            log.info('Stating service with command ' + command)

            out = await adb.getDevice(options.serial).shell(command)
            try {
                const line = await streamutil.findLine(out, /^Error/) // reject if no errors in stdout
                throw new Error(util.format('[second attempt] Service had an error: "%s"', line))
            }
            catch (err: any) {
                if (err instanceof streamutil.NoSuchLineError) { // success
                    return true
                }
                throw err
            }
            finally {
                out?.end()
                out = null
            }
        }

        const handleEnvelope = (data: Buffer<ArrayBuffer>) => {
            const envelope = apk.wire.Envelope.decode(data) as any
            if (envelope.id) {
                messageResolver.resolve(envelope.id, envelope.message)
                return
            }

            let message
            switch (envelope.type) {
            case apk.wire.MessageType.EVENT_AIRPLANE_MODE:
                message = apk.wire.AirplaneModeEvent.decode(envelope.message) as any
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

        const runAgentCommand = (type: string, cmd: any) =>
            agent.writer?.write(new apk.wire.Envelope(null, type, cmd.encodeNB()).encodeNB())

        const runServiceCommand = (type: string, cmd: any) => {
            const resolver = new Deferred()
            const id = Math.floor(Math.random() * 0xFFFFFF)

            service.writer?.write(new apk.wire.Envelope(id, type, cmd.encodeNB()).encodeNB())

            return messageResolver.await(id, resolver)
        }

        const keyEvent = (data: any) =>
            runAgentCommand(apk.wire.MessageType.DO_KEYEVENT, new apk.wire.KeyEventRequest(data))

        const plugin = new class extends EventEmitter {
            type = (text: string) =>
                devutil.executeShellCommand("am broadcast -a ADB_INPUT_TEXT --es msg '" + text + "'")

            paste = async(text: string) => {
                await this.setClipboard(text)

                // Give it a little bit of time to settle.
                await new Promise(r => setTimeout(r, 500))
                keyEvent({
                    event: apk.wire.KeyEvent.PRESS, // @ts-ignore
                    keyCode: adb.Keycode.KEYCODE_V,
                    ctrlKey: true
                })
            }

            copy = () => this.getClipboard()

            getDisplay = (id: string) =>
                runServiceCommand(apk.wire.MessageType.GET_DISPLAY, new apk.wire.GetDisplayRequest(id))
                    .then((data) => {
                        log.info('DISPLAY RESPONSE !')
                        const response = apk.wire.GetDisplayResponse.decode(data)
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

            wake = () =>
                runAgentCommand(apk.wire.MessageType.DO_WAKE, new apk.wire.DoWakeRequest())

            rotate = (rotation: number) =>
                runAgentCommand(apk.wire.MessageType.SET_ROTATION, new apk.wire.SetRotationRequest(rotation, true))

            freezeRotation = (rotation: number) =>
                runAgentCommand(apk.wire.MessageType.SET_ROTATION, new apk.wire.SetRotationRequest(rotation, true))

            thawRotation = () =>
                runAgentCommand(apk.wire.MessageType.SET_ROTATION, new apk.wire.SetRotationRequest(0, false))

            version = () =>
                runServiceCommand(apk.wire.MessageType.GET_VERSION, new apk.wire.GetVersionRequest())
                    .then((data) => {
                        const response = apk.wire.GetVersionResponse.decode(data)
                        if (response.success) {
                            return response.version
                        }
                        throw new Error('Unable to retrieve version')
                    })

            unlock = () =>
                runServiceCommand(apk.wire.MessageType.SET_KEYGUARD_STATE, new apk.wire.SetKeyguardStateRequest(false))
                    .then((data) => {
                        const response = apk.wire.SetKeyguardStateResponse.decode(data)
                        if (!response.success) {
                            throw new Error('Unable to unlock device')
                        }
                    })

            lock = () =>
                runServiceCommand(apk.wire.MessageType.SET_KEYGUARD_STATE, new apk.wire.SetKeyguardStateRequest(true))
                    .then((data) => {
                        const response = apk.wire.SetKeyguardStateResponse.decode(data)
                        if (!response.success) {
                            throw new Error('Unable to lock device')
                        }
                    })

            acquireWakeLock = () =>
                runServiceCommand(apk.wire.MessageType.SET_WAKE_LOCK, new apk.wire.SetWakeLockRequest(true))
                    .then((data) => {
                        const response = apk.wire.SetWakeLockResponse.decode(data)
                        if (!response.success) {
                            throw new Error('Unable to acquire WakeLock')
                        }
                    })

            releaseWakeLock = () =>
                runServiceCommand(apk.wire.MessageType.SET_WAKE_LOCK, new apk.wire.SetWakeLockRequest(false))
                    .then((data) => {
                        const response = apk.wire.SetWakeLockResponse.decode(data)
                        if (!response.success) {
                            throw new Error('Unable to release WakeLock')
                        }
                    })

            identity = async() => {
                log.info('Calling Do Identify gRPC')
                const data = await runServiceCommand(apk.wire.MessageType.DO_IDENTIFY, new apk.wire.DoIdentifyRequest(options.serial))
                const response = apk.wire.DoIdentifyResponse.decode(data)
                if (!response.success) {
                    throw new Error('Unable to identify device')
                }
            }

            setClipboard = (text: string) =>
                runServiceCommand(apk.wire.MessageType.SET_CLIPBOARD, new apk.wire.SetClipboardRequest(apk.wire.ClipboardType.TEXT, text))
                    .then((data) => {
                        const response = apk.wire.SetClipboardResponse.decode(data)
                        if (!response.success) {
                            throw new Error('Unable to set clipboard')
                        }
                    })

            getClipboard = () =>
                runServiceCommand(apk.wire.MessageType.GET_CLIPBOARD, new apk.wire.GetClipboardRequest(apk.wire.ClipboardType.TEXT))
                    .then((data) => {
                        const response = apk.wire.GetClipboardResponse.decode(data)
                        if (response.success && response.type === apk.wire.ClipboardType.TEXT) {
                            return response.text
                        }
                        throw new Error('Unable to get clipboard')
                    })

            getBrowsers = () =>
                runServiceCommand(apk.wire.MessageType.GET_BROWSERS, new apk.wire.GetBrowsersRequest())
                    .then((data) => {
                        const response = apk.wire.GetBrowsersResponse.decode(data)
                        if (response.success) {
                            delete response.success
                            return response
                        }
                        throw new Error('Unable to get browser list')
                    })

            getMobileServices = () =>
                runServiceCommand(apk.wire.MessageType.GET_SERVICES, new apk.wire.GetServicesAvailabilityRequest())
                    .then((data) => {
                        const response = apk.wire.GetServicesAvailabilityResponse.decode(data)
                        if (response.success) {
                            delete response.success
                            return response
                        }
                        throw new Error('Unable to get mobile services')
                    })

            getProperties = (properties: any) =>
                runServiceCommand(apk.wire.MessageType.GET_PROPERTIES, new apk.wire.GetPropertiesRequest(properties))
                    .then(async(data) => {
                        const response = apk.wire.GetPropertiesResponse.decode(data)
                        if (!response.success) {
                            throw new Error('Unable to get properties')
                        }

                        const mapped = response.properties.reduce(
                            (acc: any, property: any) =>
                                acc[property.name] = property.value, {}
                        )
                        if (mapped.imei) {
                            return mapped
                        }

                        const props = await adb.getDevice(options.serial).getProperties()
                        const isHighSDK = Number(props['ro.build.version.sdk']) >= 24
                        const command = isHighSDK ?
                            "service call iphonesubinfo 1 | awk -F \"'\" '{print $2}' | sed '1 d' | tr -d '.' | awk '{print}' ORS= | xargs echo imei:" :
                            'service call iphonesubinfo 1 | cut -c 52-66 | tr -d \'.[:space:]\' | xargs echo imei:'

                        try {
                            const out = await adb.getDevice(options.serial).shell(command)
                            const line = await streamutil.findLine(out, (/^imei:/))
                            const splitedLine = line.split('imei: ')
                            if (splitedLine.length > 1) {
                                mapped.imei = line.split('imei: ')[1]
                            }
                            else {
                                mapped.imei = 'secured'
                            }
                            return mapped
                        }
                        catch (err: any) {
                            log.error('Get device properties error: %s', err.message)
                            log.info('setting secured imei because of error')
                            mapped.imei = 'secured'
                            return mapped
                        }
                    })

            getAccounts = (data: any) =>
                runServiceCommand(apk.wire.MessageType.GET_ACCOUNTS, new apk.wire.GetAccountsRequest({type: data.type}))
                    .then((data) => {
                        const response = apk.wire.GetAccountsResponse.decode(data)
                        if (!response.success) {
                            throw new Error('No accounts returned')
                        }
                        return response.accounts
                    })

            removeAccount = async(data: any) => {
                const cmdData = await runServiceCommand(apk.wire.MessageType.DO_REMOVE_ACCOUNT, new apk.wire.DoRemoveAccountRequest({
                    type: data.type,
                    account: data.account
                }))

                const response = apk.wire.DoRemoveAccountResponse.decode(cmdData)
                if (!response.success) {
                    throw new Error('Unable to remove account')
                }
                return true
            }

            addAccountMenu = () =>
                runServiceCommand(apk.wire.MessageType.DO_ADD_ACCOUNT_MENU, new apk.wire.DoAddAccountMenuRequest())
                    .then((data) => {
                        const response = apk.wire.DoAddAccountMenuResponse.decode(data)
                        if (!response.success) {
                            throw new Error('Unable to show add account menu')
                        }
                        return true
                    })

            cleanupBondedBluetoothDevices = () =>
                runServiceCommand(apk.wire.MessageType.DO_CLEAN_BLUETOOTH_BONDED_DEVICES, new apk.wire.DoCleanBluetoothBondedDevicesRequest())
                    .then((data) => {
                        const response = apk.wire.DoCleanBluetoothBondedDevicesResponse.decode(data)
                        if (!response.success) {
                            throw new Error('Unable to clean bluetooth bonded devices')
                        }
                        return true
                    })

            setRingerMode = (mode: number) =>
                runServiceCommand(apk.wire.MessageType.SET_RINGER_MODE, new apk.wire.SetRingerModeRequest(mode))
                    .then((data) => {
                        const response = apk.wire.SetRingerModeResponse.decode(data)
                        if (!response.success) {
                            throw new Error('Unable to set ringer mode')
                        }
                    })

            getRingerMode = () =>
                runServiceCommand(apk.wire.MessageType.GET_RINGER_MODE, new apk.wire.GetRingerModeRequest())
                    .then((data) => {
                        const response = apk.wire.GetRingerModeResponse.decode(data)

                        // Reflection to decode enums to their string values, otherwise
                        // we only get an integer
                        const ringerMode = apk.builder
                            .lookup('jp.co.cyberagent.stf.proto.RingerMode')
                            .children[response.mode].name

                        if (!response.success) {
                            throw new Error('Unable to get ringer mode')
                        }

                        return ringerMode
                    })

            setWifiEnabled = (enabled: boolean) =>
                runServiceCommand(apk.wire.MessageType.SET_WIFI_ENABLED, new apk.wire.SetWifiEnabledRequest(enabled))
                    .then((data) => {
                        const response = apk.wire.SetWifiEnabledResponse.decode(data)
                        if (!response.success) {
                            throw new Error('Unable to set Wifi')
                        }
                    })

            getWifiStatus = () =>
                runServiceCommand(apk.wire.MessageType.GET_WIFI_STATUS, new apk.wire.GetWifiStatusRequest())
                    .then((data) => {
                        const response = apk.wire.GetWifiStatusResponse.decode(data)
                        if (!response.success) {
                            throw new Error('Unable to get Wifi status')
                        }
                        return response.status
                    })

            sendCommand = function(command: string) {
                log.info('Executing shell command ' + command + ' on ' + options.serial)
                devutil.executeShellCommand(command)
            }

            setBluetoothEnabled = (enabled: boolean) =>
                runServiceCommand(apk.wire.MessageType.SET_BLUETOOTH_ENABLED, new apk.wire.SetBluetoothEnabledRequest(enabled))
                    .then((data) => {
                        const response = apk.wire.SetBluetoothEnabledResponse.decode(data)
                        if (!response.success) {
                            throw new Error('Unable to set Bluetooth')
                        }
                    })

            cleanBluetoothBonds = () =>
                runServiceCommand(apk.wire.MessageType.DO_CLEAN_BLUETOOTH_BONDED_DEVICES, new apk.wire.DoCleanBluetoothBondedDevicesRequest())
                    .then((data) => {
                        const response = apk.wire.DoCleanBluetoothBondedDevicesResponse.decode(data)
                        if (!response.success) {
                            throw new Error('Unable to clean Bluetooth bonded devices')
                        }
                    })

            getBluetoothStatus = () =>
                runServiceCommand(apk.wire.MessageType.GET_BLUETOOTH_STATUS, new apk.wire.GetBluetoothStatusRequest())
                    .then((data) => {
                        const response = apk.wire.GetBluetoothStatusResponse.decode(data)
                        if (!response.success) {
                            throw new Error('Unable to get Bluetooth status')
                        }
                        return response.status
                    })

            getSdStatus = () =>
                runServiceCommand(apk.wire.MessageType.GET_SD_STATUS, new apk.wire.GetSdStatusRequest())
                    .then((data) => {
                        const response = apk.wire.GetSdStatusResponse.decode(data)
                        if (!response.success) {
                            throw new Error('Unable to get SD card status')
                        }
                        return response.mounted
                    })

            pressKey = (key: string) => {
                keyEvent({event: apk.wire.KeyEvent.PRESS, keyCode: keyutil.namedKey(key)})
                return true
            }

            setMasterMute = (enabled: boolean) =>
                runServiceCommand(apk.wire.MessageType.SET_MASTER_MUTE, new apk.wire.SetMasterMuteRequest(enabled))
                    .then((data) => {
                        const response = apk.wire.SetMasterMuteResponse.decode(data)
                        if (!response.success) {
                            throw new Error('Unable to set master mute')
                        }
                    })

            unlockDevice = async() => {
                await devutil.executeShellCommand('input text ' + options.deviceCode)
                await devutil.executeShellCommand('input keyevent 66')
            }
        }()

        const waitForAgentDeath = (conn: Duplex, ms = 3000) => new Promise<void>(resolve => {
            let timeout = setTimeout(resolve, ms)
            conn.once('end', async() => {
                clearTimeout(timeout)
                const startTime = Date.now()
                log.important('Agent connection ended, attempting to relaunch')
                try {
                    await openAgent()
                    log.important('Agent relaunched in %dms', Date.now() - startTime)
                    resolve()
                }
                catch (err: any) {
                    log.fatal('Agent connection could not be relaunched: %s', err.message)
                    lifecycle.fatal()
                }
            })

            conn.on('error', (err: any) => {
                log.fatal('Agent connection had an error: %s', err.message)
                lifecycle.fatal()
            })
        })

        const openAgent = async() => {
            log.info('Launching agent')

            await stopAgent()
            await devutil.ensureUnusedLocalSocket(agent.sock)

            // @ts-ignore
            const out = await adb.getDevice(options.serial).shell(util.format("CLASSPATH='%s' exec app_process /system/bin '%s'", apk.path, apk.main))
            streamutil.talk(log, 'Agent says: "%s"', out)

            agent.socket = await devutil.waitForLocalSocket(agent.sock)

            agent.writer = new ms.DelimitingStream()
            agent.writer.pipe(agent.socket!)

            return waitForAgentDeath(agent.socket!)
        }

        const onServiceDeath = async() => {
            try {
                const startTime = Date.now()
                log.important('Service connection ended, attempting to relaunch')
                await openAgent() // restart agent
                await openService()
                log.important('Service relaunched in %dms', Date.now() - startTime)
            }
            catch (err: any) {
                log.fatal('[prepareForServiceDeath] Service connection could not be relaunched: %s', err?.message)
                lifecycle.fatal()
            }
        }

        // The APK should be up to date at this point. If it was reinstalled, the
        // service should have been automatically stopped while it was happening.
        // So, we should be good to go.
        const openService = async() => {
            log.info('Launching service')

            await openAgent()
            await callService(util.format("-a '%s' -n '%s'", apk.startIntent.action, apk.startIntent.component))

            service.socket = await devutil.waitForLocalSocket(service.sock)

            service.reader = service.socket!.pipe(new ms.DelimitedStream())
            service.reader.on('data', data => handleEnvelope(data))

            service.writer = new ms.DelimitingStream()
            service.writer.pipe(service.socket!)

            service.socket!.once('end', () => onServiceDeath())

            service.socket!.on('error', () => onServiceDeath())

            await devutil.executeShellCommand('settings put system screen_brightness 0')
            await devutil.executeShellCommand('settings put system screen_brightness_mode 0')
            await devutil.executeShellCommand('input keyevent 26')
        }

        await openService()

        router
            .on(wire.PhysicalIdentifyMessage, (channel) => {
                plugin.identity()
                push.send([
                    channel,
                    wireutil.reply(options.serial).okay()
                ])
            })
            .on(wire.KeyDownMessage, (channel, message) => {
                try {
                    keyEvent({
                        event: apk.wire.KeyEvent.DOWN,
                        keyCode: keyutil.namedKey(message.key)
                    })
                }
                catch (e: any) {
                    log.warn(e.message)
                }
            })
            .on(wire.KeyUpMessage, (channel, message) => {
                try {
                    keyEvent({
                        event: apk.wire.KeyEvent.UP,
                        keyCode: keyutil.namedKey(message.key)
                    })
                }
                catch (e: any) {
                    log.warn(e.message)
                }
            })
            .on(wire.KeyPressMessage, (channel, message) => {
                try {
                    keyEvent({
                        event: apk.wire.KeyEvent.PRESS,
                        keyCode: keyutil.namedKey(message.key)
                    })
                }
                catch (e: any) {
                    log.warn(e.message)
                }
            })
            .on(wire.TypeMessage, (channel, message) =>
                plugin.type(message.text)
            )
            .on(wire.RotateMessage, (channel, message) =>
                plugin.rotate(message.rotation)
            )
            .on(wire.UnlockDeviceMessage, (channel, message) =>
                plugin.unlockDevice()
            )
        return plugin
    })
