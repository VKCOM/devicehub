import syrup from '@devicefarmer/stf-syrup'
import sdb from './sdb/index.js'
import push from '../../base-device/support/push.js'
import router from '../../base-device/support/router.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import temp from 'tmp-promise'
import logger from '../../../util/logger.js'
import storage from '../../base-device/support/storage.js'
import {basename} from 'path'
import {unlink} from 'fs'

export default syrup.serial()
    .dependency(push)
    .dependency(router)
    .dependency(sdb)
    .dependency(storage)
    .define((options, push, router, sdb, storage) => () => {
        const log = logger.createLogger('tizen-device:plugins:filesystem')
        const reply = wireutil.reply(options.serial)

        const uploadFromDevice = async(filePath, jwt) => {
            const destination = await temp.file()
            log.info(`Downloading temp file from device to ${destination.path}`)
            const size = await sdb.shell(`stat --format='%s' "${filePath}"'`)
            await sdb.pull(filePath, destination.path)
            // We may have added new storage plugins for various file types
            // in the future, and add proper detection for the mimetype.
            // But for now, let's just use application/octet-stream for
            // everything like it's 2001.
            const storedFile = await storage.storeByPath(destination.path, 'blob', {
                filename: basename(filePath),
                contentType: 'application/octet-stream',
                knownLength: Number(size) || 0,
                jwt
            })

            unlink(destination.path, err =>
                log.error('Failed delete temp file when uploaded from device:', err)
            )
            return storedFile
        }

        router.on(wire.FileSystemGetMessage, async(channel, message) => {
            try {
                const file = await uploadFromDevice(message.file, message.jwt)
                push.send([
                    channel,
                    reply.okay('success', file)
                ])
            }
            catch (/** @type {any} */ err) {
                log.warn('Unable to retrieve "%s"', message.file, err)
                push.send([
                    channel,
                    reply.fail(err.message)
                ])
            }
        })

        const ls = dir => {
            if (dir === '/') {
                dir = ''
            }
            return sdb.shell(
                `for f in ${dir}/*; do
                  [ -e "$f" ] || continue
                  name=$(basename "$f")
                  stat_output=$(stat --format='{"name":"'"$name"'","size":%s,"mode":"%f","mtime":"%y","ctime":"%z","atime":"%x"}' "$f")
                  echo "$stat_output"
                done`
            ).then(out => out.split('\n').map(item => {
                const parsed = JSON.parse(item.trim())
                parsed.mode = parseInt(parsed.mode, 16)
                parsed.name = parsed.name.replace(/\/+/g, '/')
                return parsed
            }))
        }

        router.on(wire.FileSystemListMessage, async(channel, message) => {
            try {
                push.send([
                    channel,
                    reply.okay('success', await ls(message.dir))
                ])
            }
            catch (/** @type {any} */ err) {
                push.send([
                    channel,
                    reply.fail(err?.message || err)
                ])
            }
        })
    })
