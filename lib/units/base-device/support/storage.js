import util from 'util'
import url from 'url'
import syrup from '@devicefarmer/stf-syrup'
import request from 'postman-request'
import logger from '../../../util/logger.js'
import {createReadStream, createWriteStream} from 'fs'
import {unlink} from 'fs/promises'
import {Readable} from 'stream'
import temp from 'tmp-promise'
import {finished} from 'stream/promises'

export default syrup.serial()
    .define(options => {
        const log = logger.createLogger('base-device:support:storage')
        const plugin = {
            store: (type, stream, meta) => new Promise((resolve, reject) => {
                const args = {
                    url: url.resolve(options.storageUrl, util.format('s/upload/%s', type)),
                    headers: {
                        internal: 'Internal ' + meta.jwt
                    }
                }
                const req = request.post(args, (err, res, body) => {
                    try {
                        if (err) {
                            log.error('Upload to "%s" failed', args.url, err.stack)
                            reject(err)
                            return
                        }

                        if (res.statusCode !== 201) {
                            log.error('Upload to "%s" failed: HTTP %d', args.url, res.statusCode)
                            log.debug(body)
                            reject(
                                new Error(util.format('Upload to "%s" failed: HTTP %d', args.url, res.statusCode))
                            )
                            return
                        }

                        const result = JSON.parse(body)
                        log.info('Uploaded to "%s"', result.resources.file.href)
                        resolve(result.resources.file)
                    }
                    catch (/** @type {any} */ err) {
                        log.error('Invalid JSON in response', err.stack, body)
                        reject(err)
                    }
                })

                req.form().append('file', stream, meta)
            }),

            storeByPath: (path, type, meta) =>
                plugin.store(type, createReadStream(path), meta),

            get: async(href, channel, jwt) => {
                const apkUrl = url.resolve(options.storageUrl, href)
                const res = await fetch(apkUrl, {
                    headers: {
                        channel, Authorization: `Bearer ${jwt}`,
                        device: options.serial
                    }
                })

                log.info('Reading', apkUrl, ' returned: ', res.status)
                if (res.status >= 300) {
                    throw Error(`Could not download file. Server returned status = ${res.status}, ${await res.text()}`)
                }
                if (res.body === null) {
                    throw Error(`Could not download file. Server returned no body and status = ${res.status}`)
                }

                return Readable.fromWeb(res.body)
            },

            download: async(href, channel, jwt, localPath, name) => {
                const fileStream = await plugin.get(href, channel, jwt)
                const file = (localPath && {path: localPath}) || await temp.file(name ? {name} : {})
                const writeStream = createWriteStream(file.path)

                log.info(`Downloading to ${file.path}`)

                await finished(fileStream.pipe(writeStream))

                return {
                    path: file.path,
                    cleanup: () =>
                        file?.cleanup ? file.cleanup() : unlink(file.path)
                }
            }
        }
        return plugin
    })
