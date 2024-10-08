import syrup from '@devicefarmer/stf-syrup'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import {spawn} from 'child_process'
import Promise from 'bluebird'
import dbapi from '../../../db/api.mjs'
import logger from '../../../util/logger.js'
import push from '../../base-device/support/push.js'
import router from '../../base-device/support/router.js'
import sub from '../../base-device/support/sub.js'
import group from './group.js'
export default syrup
    .serial()
    .dependency(push)
    .dependency(router)
    .dependency(sub)
    .dependency(group)
    .define(function(options, push, router, group) {
    const log = logger.createLogger('device:plugins:devicelog')
    let launchArgs = [
        '--id'
        , options.serial
        , '--verbose'
        , '--debug'
        , '--noinstall'
        , '--bundle'
    ]
    let DeviceLogger = {
        appOptions: {}
        , channel: ''
        , stream: null
        , setChannel: channel => {
            this.channel = channel
        }
        , startLoggging: function(channel, deviceData) {
            DeviceLogger.setChannel(channel)
            if (deviceData && deviceData.bundleName.length !== 0 &&
                deviceData.bundleName.substr(-4) === '.app') {
                group.get().then(group => {
                    launchArgs.push(deviceData.bundleName)
                    this.stream = spawn('ios-deploy1', launchArgs, {
                        shell: true
                        , cwd: deviceData.pathToApp
                    })
                    this.stream.stdout.on('data', data => {
                        push.send([
                            group.group
                            , wireutil.envelope(new wire.DeviceLogcatEntryMessage(options.serial, new Date().getTime() / 1000, this.stream.pid, this.stream.pid, 1, 'device:log:cat', data.toString()))
                        ])
                    })
                    this.stream.on('close', err => {
                        log.fatal('Unable to get devicelog', err)
                        this.killLoggingProcess()
                    })
                })
            }
        }
        , killLoggingProcess: () => {
            if (this.stream) {
                process.kill(-this.stream.pid)
                this.stream.kill()
                this.stream = null
                this.channel = ''
            }
        }
    }
    group.on('leave', DeviceLogger.killLoggingProcess)
    router
        .on(wire.LogcatStartMessage, function(channel, message) {
        let reply = wireutil.reply(options.serial)
        dbapi.loadDeviceBySerial(options.serial).then(device => {
            if (device.installedApps) {
                let data = device.installedApps.filter(item => {
                    return item.bundleName === message.filters[0].tag
                })
                DeviceLogger.startLoggging(channel, data[0])
                push.send([channel, reply.okay('success')])
            }
            else {
                log.error('No installed apps.')
            }
        })
            .catch(err => {
            log.error(err)
            DeviceLogger.killLoggingProcess()
        })
    })
        .on(wire.LogcatStopMessage, function(channel, data) {
        DeviceLogger.killLoggingProcess()
    })
        .on(wire.GroupMessage, function(channel, data) {
        DeviceLogger.channel = channel
    })
    return Promise.resolve()
})
