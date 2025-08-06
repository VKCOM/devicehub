import {v4 as uuidv4} from 'uuid'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import Promise from 'bluebird'
import {exec} from 'child_process'
import * as promiseutil from '../../../util/promiseutil.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import storage from '../../base-device/support/storage.js'
import deviceutil from '../../../util/deviceutil.js'

function execShellCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(error)
            }
            resolve(stdout)
        })
    })
}
const installApp = (udid, filepath) => {
    let commands = [
        `idb install ${filepath} --udid=${udid}`
    ]
    return execShellCommand(commands.join(';'))
}

const launchApp = (udid, bundleId) => {
    let commands = [
        `idb launch ${bundleId} --udid=${udid}`
    ]
    return execShellCommand(commands.join(';'))
}

const uninstallApp = (udid, bundleId) => {
    let commands = [
        `idb uninstall ${bundleId} --udid=${udid}`
    ]
    return execShellCommand(commands.join(';'))
}
export default syrup.serial()
    .dependency(router)
    .dependency(push)
    .dependency(storage)
    .define(function(options, router, push, storage) {
        const log = logger.createLogger('ios-device:plugins:install')
        const reply = wireutil.reply(options.serial)

        router.on(wire.InstallMessage, async function(channel, message) {
            log.info('Installing application from "%s"', message.href)
            const jwt = message.jwt

            const sendProgress = (data, progress) =>
                push.send([channel, reply.progress(data, progress)])

            sendProgress('starting', 0)

            const stopProgressUp = deviceutil.progressUp(sendProgress)

            const {path, cleanup} = await storage.download(message.href, channel, jwt, null, uuidv4() + '.ipa')
            stopProgressUp()

            let guesstimate = 60
            sendProgress('installing_app', guesstimate)
            // '/var/folders/0t/sq4p1g716_n_nvj602_j2dnw0000gp/T/tmp-62584-3cTw404sw38m'
            // '/var/folders/0t/sq4p1g716_n_nvj602_j2dnw0000gp/T/tmp-62584-3cTw404sw38m/4f0787e8-8e45-4d27-b145-e2101c474656.ipa'
            promiseutil.periodicNotify(installApp(options.serial, path), 250)
                .progressed(() => {
                    guesstimate = Math.min(95, guesstimate + 1.5 * (95 - guesstimate) / 35)
                    sendProgress('installing_app', guesstimate)
                })
                .then((result) => {
                    push.send([channel, reply.okay('INSTALL_SUCCEEDED')])
                    if (message.launch) {
                        const bundleId = result.match(/.[\w.-]+[\w-]/)
                        sendProgress('launching_app', 100)
                        launchApp(options.serial, bundleId)
                    }
                })
                .catch((err) => {
                    let errorReply = 'INSTALL_ERROR_UNKNOWN'
                    log.error('Installation of package failed', err.stack)
                    if (err.stack.includes('ApplicationVerificationFailed')) {
                        errorReply = 'INSTALL_ERROR_APP_SIGNING'
                    }
                    if (err.stack.includes('not in the bundles supported architectures')) {
                        errorReply = 'INSTALL_ERROR_APP_ARCHITECTURE'
                    }
                    if (err.stack.includes('Exit Code 1 is not acceptable [0]')) {
                        errorReply = 'INSTALL_ERROR_IDB_INTERNAL_ERROR'
                    }
                    push.send([channel, reply.fail(errorReply)])
                })
                .finally(() => {
                    log.info('Deleting temp file')
                    cleanup()
                })
        })
        router.on(wire.UninstallIosMessage, function(channel, message) {
            uninstallApp(options.serial, message.packageName)
        })
    })
