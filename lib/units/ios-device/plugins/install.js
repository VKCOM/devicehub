import stream from 'stream'
import url from 'url'
import {v4 as uuidv4} from 'uuid'
import syrup from '@devicefarmer/stf-syrup'
import request from 'postman-request'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import Promise from 'bluebird'
import {mkdir as mkdir$0, unlinkSync, createWriteStream} from 'fs'
import {exec as exec$0} from 'child_process'
import * as promiseutil from '../../../util/promiseutil.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'

const mkdir = Promise.promisify({mkdir: mkdir$0}.mkdir)
const exec = {exec: exec$0}.exec
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
const installApp = (udid, filepath, id) => {
    let commands = [
        `idb install ${filepath}/${id}.ipa --udid=${udid}`
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
    .define(function(options, router, push) {
        const log = logger.createLogger('device:plugins:install')
        router.on(wire.InstallMessage, async function(channel, message) {
            log.info('Installing application from "%s"', message.href)
            const reply = wireutil.reply(options.serial)
            let jwt = message.jwt

            function sendProgress(data, progress) {
                push.send([channel, reply.progress(data, progress)])
            }

            sendProgress('starting', 0)

            const id = uuidv4()
            const tmpDirPath = `/tmp/${id}`
            const filePath = `${tmpDirPath}/${id}.ipa`

            log.info('mkdir "%s"', tmpDirPath)

            await mkdir(tmpDirPath)
            const file = createWriteStream(filePath)

            let ipaUrl = options.storageUrl.replace(/\/+$/, '') + message.href
            log.info('url: ', ipaUrl)

            let res = await fetch(ipaUrl, {
                headers: {
                    channel: channel,
                    internal: 'Internal ' + jwt,
                    device: options.serial
                }
            })

            log.info('Reading', ipaUrl, ' returned: ', res.status)
            if (res.status >= 400 || res.body === null) {
                log.error('Could not fetch ipa: ', await res.text())
                push.send([
                    channel,
                    reply.fail('Could not fetch ipa from the storage')
                ])
                return
            }
            const reader = stream.Readable.fromWeb(res.body)
            reader.pipe(file)
            sendProgress('pushing_app', 50)
            file.on('finish', () => {
                file.close()
                log.info('Download Completed')
                let guesstimate = 60

                sendProgress('installing_app', guesstimate)

                promiseutil.periodicNotify(installApp(options.serial, tmpDirPath, id), 250)
                    .progressed(() => {
                        guesstimate = Math.min(95, guesstimate + 1.5 * (95 - guesstimate) / 35)
                        sendProgress('installing_app', guesstimate)
                    })
                    .then((result) => {
                        push.send([channel, reply.okay('INSTALL_SUCCEEDED')])
                        if (message.launch) {
                            let bundleId = result.match(/.[\w.-]+[\w-]/)
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
                        unlinkSync(filePath)
                    })
            })
        })
        router.on(wire.UninstallIosMessage, function(channel, message) {
            uninstallApp(options.serial, message.packageName)
        })
    })
