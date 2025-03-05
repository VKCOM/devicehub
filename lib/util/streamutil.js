import util from 'util'
import Promise from 'bluebird'
import split from 'split'
import {Readable} from 'stream'
function NoSuchLineError(message) {
    Error.call(this, message)
    this.name = 'NoSuchLineError'
    Error.captureStackTrace(this, NoSuchLineError)
}
util.inherits(NoSuchLineError, Error)

/**
 * Read everything from the stream in a buffer
 * @param {Readable} stream readable stream to read from
 * @returns {Promise<Buffer>} result buffer
 */
export const readAll = function(stream) {
    var resolver = Promise.defer()
    var collected = Buffer.alloc(0)
    function errorListener(/** @type {Error} */ err) {
        resolver.reject(err)
    }
    function endListener() {
        resolver.resolve(collected)
    }
    function readableListener() {
        var chunk
        while ((chunk = stream.read())) {
            collected = Buffer.concat([collected, chunk])
        }
    }
    stream.on('error', errorListener)
    stream.on('readable', readableListener)
    stream.on('end', endListener)
    readableListener()
    return resolver.promise.finally(function() {
        stream.removeListener('error', errorListener)
        stream.removeListener('readable', readableListener)
        stream.removeListener('end', endListener)
    })
}
export const findLine = function(stream, re) {
    var resolver = Promise.defer()
    var piped = stream.pipe(split())
    function errorListener(err) {
        resolver.reject(err)
    }
    function endListener() {
        resolver.reject(new NoSuchLineError())
    }
    function lineListener(line) {
        if (re.test(line)) {
            resolver.resolve(line)
        }
    }
    piped.on('error', errorListener)
    piped.on('data', lineListener)
    piped.on('end', endListener)
    return resolver.promise.finally(function() {
        piped.removeListener('error', errorListener)
        piped.removeListener('data', lineListener)
        piped.removeListener('end', endListener)
        stream.unpipe(piped)
    })
}
export const talk = function(log, format, stream) {
    stream.pipe(split())
        .on('data', function(chunk) {
            var line = chunk.toString().trim()
            if (line.length) {
                log.info(format, line)
            }
        })
}
export {NoSuchLineError}
