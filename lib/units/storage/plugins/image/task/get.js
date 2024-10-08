import util from 'util'
import stream from 'stream'
import url from 'url'
import Promise from 'bluebird'
import request from 'postman-request'
export default (function(path, options) {
    return new Promise(function(resolve, reject) {
        var res = request.get(url.resolve(options.storageUrl, path))
        var ret = new stream.Readable().wrap(res) // Wrap old-style stream
        res.on('response', function(res) {
            if (res.statusCode !== 200) {
                reject(new Error(util.format('HTTP %d', res.statusCode)))
            }
            else {
                resolve(ret)
            }
        })
            .on('error', reject)
    })
})
