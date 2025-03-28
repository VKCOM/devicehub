import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import storage from '../../base-device/support/storage.js'
import {execFile} from 'child_process'
import path from 'path'
import fs from 'fs'
import {v4 as uuidv4} from 'uuid'
export default syrup.serial()
    .dependency(router)
    .dependency(push)
    .dependency(storage)
    .define(function(options, router, push, storage) {
        const log = logger.createLogger('device:plugins:filesystem')
        let plugin = Object.create(null)

        const getIdbTarget = dir => {
            let currentPath = dir.split('/')
            let rootDir = currentPath[1]
            if (['root', 'application', 'crashes'].indexOf(rootDir) !== -1) {
                return rootDir
            }
            else {
                return 'media'
            }
        }

        router.on(wire.FileSystemGetMessage, function(channel, message) {
            let reply = wireutil.reply(options.serial)
            let file = message.file
            let currentPath = file.split('/')
            let target = getIdbTarget(file)
            let tempFileName = `tmp_${uuidv4()}`
            const storedFile = `/tmp/${tempFileName}`
            log.info('Retrieving file "%s" to %s', file, tempFileName)
            const jwt = message.jwt

            if (currentPath.length === 2) {
                currentPath = ''
            }
            else {
                currentPath = currentPath.slice(2).join('/').replace(' ', '\\ ')
            }

            execFile('idb', ['file', 'pull', `--${target}`, currentPath, storedFile, '--json', '--udid', options.serial],
                (error, stdout, stderr) => {
                    if (error) {
                        log.error('Unable to pull file "%s"', file, stderr)
                        push.send([
                            channel
                            , reply.fail('Could not pull file')
                        ])
                        return
                    }

                    storage.store('blob', fs.createReadStream(storedFile), {
                        filename: path.basename(file)
                        , contentType: 'application/octet-stream'
                        , jwt: jwt
                    }).then((file) => {
                        push.send([
                            channel
                            , reply.okay('success', file)
                        ])
                        fs.unlink(storedFile, (err) => {
                            log.error('Error while deleting file "%s"', file, err)
                        })
                    })
                }
            )
        })
        router.on(wire.FileSystemListMessage, function(channel, message) {
            let reply = wireutil.reply(options.serial)
            let dirs = []
            let rootDir = message.dir
            if (rootDir === '/') {
                dirs = [
                    {name: 'root', mtime: '1970-01-01T00:00:00.000Z', atime: null, ctime: null, birthtime: null, mode: 16877, size: 0}
                    , {name: 'application', mtime: '1970-01-01T00:00:00.000Z', atime: null, ctime: null, birthtime: null, mode: 16877, size: 0}
                    , {name: 'crashes', mtime: '1970-01-01T00:00:00.000Z', atime: null, ctime: null, birthtime: null, mode: 16877, size: 0}
                    , {name: 'media', mtime: '1970-01-01T00:00:00.000Z', atime: null, ctime: null, birthtime: null, mode: 16877, size: 0}
                ]
                push.send([
                    channel
                    , reply.okay('success', dirs)
                ])
            }
            let currentPath = message.dir.split('/')
            let target = getIdbTarget(message.dir)

            if (currentPath.length === 2) {
                currentPath = ''
            }
            else {
                currentPath = currentPath.slice(2).join('/').replace(' ', '\\ ')
            }

            execFile('idb', ['file', 'list', `--${target}`, currentPath, '--json', '--udid', options.serial],
                (error, stdout, stderr) => {
                    if (error) {
                        log.warn('Unable to list directory "%s"', message.dir, stderr)
                        push.send([
                            channel
                            , reply.fail(error.message)
                        ])
                        return
                    }

                    let rawDirs = JSON.parse(stdout)
                    let entries = []
                    rawDirs.forEach(dir => {
                        let name = dir.path
                        let mode = 0o40365
                        if (name.includes('.')) {
                            mode = 0o555
                        }
                        entries.push({
                            name: name, mtime: '1970-01-01T00:00:00.000Z', atime: null, ctime: null, birthtime: null, mode: mode, size: 0
                        })
                    })

                    push.send([
                        channel
                        , reply.okay('success', entries)
                    ])
                }
            )
        })
        return plugin
    })
