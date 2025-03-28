import syrup from '@devicefarmer/stf-syrup'
import wireutil from '../../../../wire/util.js'
import wire from '../../../../wire/index.js'
import logger from '../../../../util/logger.js'
import request from 'request-promise'
import _ from 'lodash'
import push from '../../../base-device/support/push.js'
import * as iosutil from '../util/iosutil.js'
export default syrup.serial()
    .dependency(push)
    .define((options, push) => {
        const log = logger.createLogger('device:info')
        const baseUrl = iosutil.getUri(options.wdaHost, options.wdaPort)
        async function manageDeviceInfo() {
            log.info('device.name: ' + options.deviceName)
            let solo = wireutil.makePrivateChannel()
            let osName = options.deviceInfo.os_version.split(' ')[0]
            let osVersion = options.deviceInfo.os_version.split(' ')[1]
            const serviceData = {hasAPNS: true}
            const wsUrl = _.template(options.screenWsUrlPattern || '')({
                publicIp: options.publicIp
                , publicPort: options.screenPort
                , serial: options.serial
            })
            push.send([
                wireutil.global
                , wireutil.envelope(
                    new wire.InitializeIosDeviceState(options.serial, wireutil.toDeviceStatus('device')
                        , new wire.ProviderIosMessage(solo, options.provider, wsUrl)
                        , new wire.IosDevicePorts(options.screenPort, options.mjpegPort)
                        , new wire.UpdateIosDevice(options.serial
                            , options.deviceName
                            , osName
                            , options.deviceInfo.architecture
                            , osVersion
                            , serviceData
                        )))
            ])
            const handleRequest = (reqOptions) => {
                return new Promise((resolve, reject) => {
                    request(reqOptions)
                        .then((res) => {
                            resolve(res)
                        })
                        .catch((err) => {
                            reject(err)
                        })
                })
            }
            // Get device type
            let deviceType
            const deviceInfo = await handleRequest({
                method: 'GET'
                , uri: `${baseUrl}/wda/device/info`
                , json: true
            })
            let deviceInfoModel = deviceInfo.value.model.toLowerCase()
            let deviceInfoName = deviceInfo.value.name.toLowerCase()
            if (deviceInfoModel.includes('tv') || deviceInfoName.includes('tv')) {
                deviceType = 'Apple TV'
            }
            else {
                deviceType = 'iPhone'
            }
            // Store device type
            log.info('Storing device type value: ' + deviceType)
            push.send([
                wireutil.global
                , wireutil.envelope(new wire.DeviceTypeMessage(options.serial, deviceType))
            ])
            const sessionResponse = await handleRequest({
                method: 'POST'
                , uri: `${baseUrl}/session`
                , body: {capabilities: {}}
                , json: true,
            })
            let sessionId = sessionResponse.sessionId
            // Store device version
            log.info('Storing device version')
            push.send([
                wireutil.global
                , wireutil.envelope(new wire.SdkIosVersion(options.serial, sessionResponse.value.capabilities.sdkVersion))
            ])
            // Store battery info
            if (deviceType !== 'Apple TV') {
                const batteryInfoResponse = await handleRequest({
                    method: 'GET'
                    , uri: `${baseUrl}/session/${sessionId}/wda/batteryInfo`
                    , json: true,
                })
                let batteryState = iosutil.batteryState(batteryInfoResponse.value.state)
                let batteryLevel = iosutil.batteryLevel(batteryInfoResponse.value.level)
                push.send([
                    wireutil.global
                    , wireutil.envelope(new wire.BatteryEvent(options.serial, batteryState, 'good', 'usb', batteryLevel, 1, 0.0, 5))
                ])
            }
            // Store size info
            const firstSessionSize = await handleRequest({
                method: 'GET'
                , uri: `${baseUrl}/session/${sessionId}/window/size`
                , json: true
            })
            let deviceSize = firstSessionSize.value
            let {width, height} = deviceSize
            const scaleResponse = await handleRequest({
                method: 'GET'
                , uri: `${baseUrl}/session/${sessionId}/wda/screen`,
            })
            let parsedResponse = JSON.parse(scaleResponse)
            let scale = parsedResponse.value.scale
            height *= scale
            width *= scale
            log.info('Storing device size/scale')
            push.send([
                wireutil.global
                , wireutil.envelope(new wire.SizeIosDevice(options.serial, height, width, scale))
            ])
        }
        return {
            manageDeviceInfo
        }
    })
