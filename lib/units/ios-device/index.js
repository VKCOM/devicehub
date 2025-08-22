import syrup from '@devicefarmer/stf-syrup'
import logger from '../../util/logger.js'
import lifecycle from '../../util/lifecycle.js'
import logger$0 from '../base-device/support/logger.js'
import heartbeat from '../base-device/plugins/heartbeat.js'
import solo from '../base-device/plugins/solo.js'
import info from './plugins/info/index.js'
import wda from './plugins/wda/index.js'
import push from '../base-device/support/push.js'
import sub from '../base-device/support/sub.js'
import group from '../base-device/plugins/group.js'
import storage from '../base-device/support/storage.js'
import devicelog from './plugins/devicelog.js'
import stream from './plugins/screen/stream.js'
import install from './plugins/install.js'
import reboot from './plugins/reboot.js'
import clipboard from './plugins/clipboard.js'
import remotedebug from './plugins/remotedebug.js'
import filesystem from './plugins/filesystem.js'
import * as iosutil from './plugins/util/iosutil.js'
import {execFileSync} from 'child_process'
import connect from './plugins/wda/connect.js'
import WDAService from './plugins/wda/WDAService.js'

export default (async(/** @type {{ serial: any; } & any} */ options) => {
    const wdaService = new WDAService(options.wdaPath)
    try {
        await wdaService.start(
            options.serial,
            // @ts-ignore
            ...(!options.isSimulator ? [] : [options.wdaPort, options.mjpegPort])
        )

    }
    catch (err) {
        await wdaService.cleanup(options.serial)
        lifecycle.fatal(err)
    }

    return syrup.serial()
        .dependency(logger$0)
        .define(function(options) {
            const log = logger.createLogger('ios-device')
            log.info('Preparing device options: ', options)

            const deviceInfo = JSON.parse(execFileSync('idb', ['describe', '--udid', options.serial, '--json']).toString())
            options.deviceInfo = deviceInfo
            if (!options.isSimulator) {
                options.deviceName = iosutil.getModelName(deviceInfo.extended.device.ProductType)
            }
            else {
                options.deviceName = `Simulator ${deviceInfo.name}`
            }

            return syrup.serial()
                .dependency(heartbeat)
                .dependency(solo)
                .dependency(info)
                .dependency(wda)
                .dependency(connect)
                .dependency(push)
                .dependency(sub)
                .dependency(group)
                .dependency(storage)
                .dependency(devicelog)
                .dependency(stream)
                .dependency(install)
                .dependency(reboot)
                .dependency(clipboard)
                .dependency(remotedebug)
                .dependency(filesystem)
                .define(async(options, heartbeat, solo, info, wda, connect) => {

                    try {
                        await info.init()

                        wda.connect()
                        solo.poke()
                        connect()

                        if (process.send) {
                            process.send('ready')
                        }
                    }
                    catch (err) {
                        lifecycle.fatal(err)
                    }
                })
                .consume(options)
        })
        .consume(options)
        .catch((err) => {
            lifecycle.fatal(err)
        })
})
