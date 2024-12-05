import stream from 'stream'
import url from 'url'
import {v4 as uuidv4} from 'uuid'
import syrup from '@devicefarmer/stf-syrup'
import request from 'postman-request'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import Promise from 'bluebird'
import {mkdir as mkdir$0} from 'fs'
import http from 'http'
import https from 'https'
import fs from 'fs'
import util from 'util'
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
const installApp = (udid, filepath, id, isSimulator) => {
    const simulatorCommands = [
        `cd ${filepath} && unzip * && xcrun simctl install ${udid} *.app`
    ]
    const deviceCommands = [
        `ios install --path=${filepath}/${id} --udid=${udid}`
    ]
    let commands = deviceCommands
    if (isSimulator) {
        commands = simulatorCommands
    }
    return new Promise((resolve, reject) => {
        execShellCommand(commands.join(';')).then(() => {
            resolve()
        }).catch(err => {
            reject(err)
        })
    })
}
const launchApp = (udid, bundleId, isSimulator) => {
    const simulatorCommands = [
        `xcrun simctl launch ${udid} ${bundleId}`
    ]
    const deviceCommands = [
        `ios launch ${bundleId} --udid=${udid}`
    ]
    let commands = deviceCommands
    if (isSimulator) {
        commands = simulatorCommands
    }
    return new Promise((resolve, reject) => {
        execShellCommand(commands.join(';')).then(() => {
            resolve()
        }).catch(err => {
            reject(err)
        })
    })
}
export default syrup.serial()
    .dependency(router)
    .dependency(push)
    .define(function(options, router, push) {
        const log = logger.createLogger('device:plugins:install')
        router.on(wire.InstallMessage, function(channel, message) {
            log.info('Installing application from "%s"', message.href)
            var manifest = JSON.parse(message.manifest)
            var reply = wireutil.reply(options.serial)
            function sendProgress(data, progress) {
                push.send([
                    channel
                    , reply.progress(data, progress)
                ])
            }
            sendProgress('starting', 0)
            var req = request({
                url: url.resolve(options.storageUrl, message.href)
            })
            // TODO: test that binary source is ipa/app/zip content
            var reqInfo = new stream.Readable().wrap(req)
            log.info('regInfo: ' + JSON.stringify(reqInfo))
            // save binary source content as temporary file
            let id = uuidv4()
            // TODO: read from TMP env var?
            let tmpDirPath = '/tmp/' + id
            var filePath = tmpDirPath + '/' + id
            log.info('mkdir "%s"', tmpDirPath)
            mkdir(tmpDirPath)
                .then(() => {
                    const file = fs.createWriteStream(filePath)
                    let httpServer = http
                    if (options.storageUrl.includes('https://')) {
                        httpServer = https
                    }
                    log.info('url: ', options.storageUrl.replace(/\/+$/, '') + message.href)
                    const req2 = httpServer.get(options.storageUrl.replace(/\/+$/, '') + message.href, function(response) {
                        response.pipe(file)
                        const totalSize = response.headers['content-length']
                        let pushStart = 50
                        let pushEnd = 60
                        let progress
                        let downloadedSize = 0
                        response.on('data', (chunk) => {
                            downloadedSize += chunk.length
                            sendProgress('pushing_app', progress = Math.round((downloadedSize / totalSize) * (pushEnd - pushStart) + pushStart))
                        })
                        // after download completed close filestream
                        file.on('finish', () => {
                            file.close()
                            log.info('Download Completed')
                            var start = 60
                            var end = 95
                            var guesstimate = start
                            sendProgress('installing_app', guesstimate)
                            let isSimulator = false
                            if (manifest !== null && manifest.DTPlatformName !== null && manifest.DTPlatformName.includes('simulator')) {
                                isSimulator = true
                            }
                            log.info('isSimulator: ' + isSimulator)
                            return promiseutil.periodicNotify(installApp(options.serial, tmpDirPath, id, isSimulator), 250)
                                .progressed(function() {
                                    guesstimate = Math.min(end, guesstimate + 1.5 * (end - guesstimate) / (end - start))
                                    // log.info("guesstimate: " + guesstimate)
                                    sendProgress('installing_app', guesstimate)
                                })
                                .then(function() {
                                    if (message.launch) {
                                        log.info('CFBundleIdentifier: ' + manifest.CFBundleIdentifier)
                                        // Progress 90%
                                        sendProgress('launching_app', 100)
                                        launchApp(options.serial, manifest.CFBundleIdentifier, isSimulator)
                                    }
                                })
                                .then(function() {
                                    push.send([
                                        channel
                                        , reply.okay('INSTALL_SUCCEEDED')
                                    ])
                                })
                                .catch(function(err) {
                                    let errorReply = 'INSTALL_ERROR_UNKNOWN'
                                    log.error('Installation of package "%s" failed', manifest.CFBundleIdentifier, err.stack)
                                    if (err.stack.includes('ApplicationVerificationFailed')) {
                                        errorReply = 'INSTALL_ERROR_APP_SIGNING'
                                    }
                                    push.send([
                                        channel
                                        , reply.fail(errorReply)
                                    ])
                                })
                        })
                        // TODO: clear tmpDirPath
                    })
                }).catch(err => log.fatal('Unable to create temp dir', err))
        })
        router.on(wire.UninstallIosMessage, function(channel, message) {
            log.info('UnistallIosMessage, channel', channel)
            log.info('UnistallIosMessage, message', message)
            let args = [
                '--id', options.serial
                , ''
            ]
        })
    })
