import syrup from '@devicefarmer/stf-syrup'
import wireutil from '../../../wire/util.js'
import logger from '../../../util/logger.js'
import _ from 'lodash'
import push from '../../base-device/support/push.js'
import {getModelName} from './util/iosutil.js'
import wdaClient from './wda/client.js'
import {
    BatteryEvent,
    InitializeIosDeviceState,
    IosDevicePorts,
    RotationEvent,
    SdkIosVersion,
    SizeIosDevice,
    UpdateIosDevice
} from '../../../wire/wire.js'
import {execFileSync} from 'child_process'

export default syrup.serial()
    .dependency(push)
    .dependency(wdaClient)
    .define(async(options, push, wdaClient) => {
        const log = logger.createLogger('device:info')

        const deviceInfo = JSON.parse(
            execFileSync('idb', ['describe', '--udid', options.serial, '--json']).toString()
        )

        options.deviceInfo = deviceInfo
        const marketName = getModelName(deviceInfo?.extended?.device?.ProductType) || deviceInfo?.name || 'unknown'
        options.deviceName = deviceInfo?.name || marketName

        if (options.isSimulator) {
            options.deviceName = `Simulator ${options.deviceName}`
        }

        log.info('Device name: ' + options.deviceName)

        const os = options.deviceInfo?.os_version?.split(' ')

        push.send([
            wireutil.global,
            wireutil.pack(InitializeIosDeviceState, {
                serial: options.serial,
                status: wireutil.toDeviceStatus('device'),
                ports: IosDevicePorts.create({
                    screenPort: options.screenPort,
                    connectPort: options.mjpegPort
                }),
                options: UpdateIosDevice.create({
                    id: options.serial,
                    name: options.deviceName,
                    platform: os ? os[0] : 'unknown',
                    architecture: options.deviceInfo?.architecture || 'unknown',
                    sdk: os ? os[1] : 'unknown',
                    service: {hasAPNS: true},
                    marketName
                })
            })
        ])



        wdaClient.on('session', sdk => {
            if (!sdk) return
            push.send([
                wireutil.global,
                wireutil.pack(SdkIosVersion, {
                    id: options.serial,
                    sdkVersion: sdk
                })
            ])
        })

        wdaClient.on('battery', (batteryState, batteryLevel) => {
            push.send([
                wireutil.global,
                wireutil.pack(BatteryEvent, {
                    serial: options.serial,
                    status: batteryState,
                    health: 'good',
                    source: 'usb',
                    level: batteryLevel,
                    scale: 1,
                    temp: 0.0,
                    voltage: 5
                })
            ])
        })

        wdaClient.on('rotation', (orientation, rotationDegrees) => {
            if (!rotationDegrees) return
            push.send([
                wireutil.global,
                wireutil.pack(RotationEvent, {
                    serial: options.serial,
                    rotation: rotationDegrees
                })
            ])
        })

        wdaClient.on('display', (display) => {
            push.send([
                wireutil.global,
                wireutil.pack(SizeIosDevice, {
                    id: options.serial,
                    url: _.template(options.screenWsUrlPattern || '')({
                        publicIp: options.publicIp,
                        publicPort: options.screenPort,
                        serial: options.serial
                    }),
                    ...display
                })
            ])
        })
    })
