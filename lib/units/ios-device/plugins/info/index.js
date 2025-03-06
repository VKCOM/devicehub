import syrup from '@devicefarmer/stf-syrup'
import wireutil from '../../../../wire/util.js'
import wire from '../../../../wire/index.js'
import logger from '../../../../util/logger.js'
import _ from 'lodash'
import push from '../../../base-device/support/push.js'
export default syrup.serial()
    .dependency(push)
    .define((options, push) => {
        const log = logger.createLogger('device:info')
        function manageDeviceInfo() {
            return new Promise((resolve, reject) => {
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
                return resolve()
            })
                .catch(err => {
                    return log.error(err, 'Failed to manage device info')
                })
        }
        return {
            manageDeviceInfo
        }
    })
