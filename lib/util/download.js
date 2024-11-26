import fs from 'fs'
import Promise from 'bluebird'
import request from 'postman-request'
import progress from 'request-progress'
import * as temp from 'temp'
export default (function download(url, options, headers) {
    const resolver = Promise.defer()
    const path = temp.path(options)
    function errorListener(err) {
        resolver.reject(err)
    }
    function progressListener(state) {
        if (state.total !== null) {
            resolver.progress({
                lengthComputable: true
                , loaded: state.received
                , total: state.total
            })
        }
        else {
            resolver.progress({
                lengthComputable: false
                , loaded: state.received
                , total: state.received
            })
        }
    }
    function closeListener() {
        resolver.resolve({
            path: path
        })
    }
    resolver.progress({
        percent: 0
    })
    try {
        const req = progress(request(url, {
            headers
        }), {
            throttle: 100 // Throttle events, not upload speed,
        })
            .on('progress', progressListener)
        resolver.promise.finally(function() {
            req.removeListener('progress', progressListener)
        })
        const save = req.pipe(fs.createWriteStream(path))
            .on('error', errorListener)
            .on('close', closeListener)
        resolver.promise.finally(function() {
            save.removeListener('error', errorListener)
            save.removeListener('close', closeListener)
        })
    }
    catch (err) {
        resolver.reject(err)
    }
    return resolver.promise
})
