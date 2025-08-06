import util from 'util'
import url from 'url'
import syrup from '@devicefarmer/stf-syrup'
import Promise from 'bluebird'
import request from 'postman-request'
import logger from '../../../util/logger.js'
export default syrup.serial()
    .define(options => {
        const log = logger.createLogger('base-device:support:storage')
        let plugin = {
            store: function(type, stream, meta) {
                let resolver = Promise.defer()
                let args = {
                    url: url.resolve(options.storageUrl, util.format('s/upload/%s', type)),
                    headers: {
                        internal: 'Internal ' + meta.jwt
                    }
                }
                let req = request.post(args, function(err, res, body) {
                    if (err) {
                        log.error('Upload to "%s" failed', args.url, err.stack)
                        resolver.reject(err)
                    }
                    else if (res.statusCode !== 201) {
                        log.error('Upload to "%s" failed: HTTP %d', args.url, res.statusCode)
                        log.debug(body)
                        resolver.reject(new Error(util.format('Upload to "%s" failed: HTTP %d', args.url, res.statusCode)))
                    }
                    else {
                        try {
                            let result = JSON.parse(body)
                            log.info('Uploaded to "%s"', result.resources.file.href)
                            resolver.resolve(result.resources.file)
                        }
                        catch (/** @type {any} */ err) {
                            log.error('Invalid JSON in response', err.stack, body)
                            resolver.reject(err)
                        }
                    }
                })
                req.form()
                    .append('file', stream, meta)
                return resolver.promise
            }
        }
        return plugin
    })
