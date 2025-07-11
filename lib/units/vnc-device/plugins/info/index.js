import syrup from '@devicefarmer/stf-syrup'
import Promise from 'bluebird'
import wireutil from '../../../../wire/util.js'
import wire from '../../../../wire/index.js'
import logger from '../../../../util/logger.js'
import push from '../../../base-device/support/push.js'

export default syrup.serial()
    .dependency(push)
    .define((options, push) => {
        const log = logger.createLogger('vnc-device:info')

        function manageDeviceInfo() {
            return new Promise((resolve, reject) => {
                log.info('device.name: ' + options.deviceName)

                let solo = wireutil.makePrivateChannel()
                let osName = options.deviceOs

                push.send([
                    wireutil.global,
                    wireutil.envelope(new wire.InitializeIosDeviceState(
                        options.serial
                        , wireutil.toDeviceStatus('device')
                        , new wire.ProviderIosMessage(
                            solo,
                            options.provider,
                            options.screenWsUrlPattern || ''
                        )
                        , new wire.IosDevicePorts(
                            options.screenPort,
                            options.mjpegPort
                        )
                        , new wire.UpdateIosDevice(
                            options.serial,
                            options.deviceName,
                            osName,
                            osName
                        )
                    ))
                ])

                log.info('Storing device type value: ' + options.deviceType)
                push.send([
                    wireutil.global,
                    wireutil.envelope(new wire.DeviceTypeMessage(
                        options.serial
                        , options.deviceType
                    ))
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
