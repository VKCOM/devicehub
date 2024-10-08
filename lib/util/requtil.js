import util from 'util'
import Promise from 'bluebird'
function ValidationError(message, errors) {
    Error.call(this, message)
    this.name = 'ValidationError'
    this.errors = errors
    Error.captureStackTrace(this, ValidationError)
}
util.inherits(ValidationError, Error)
export const validate = function(req, rules) {
    return new Promise(function(resolve, reject) {
        rules()
        var errors = req.validationErrors()
        if (!errors) {
            resolve()
        }
        else {
            reject(new ValidationError('validation error', errors))
        }
    })
}
export const limit = function(limit, handler) {
    var queue = []
    var running = 0
    /* eslint no-use-before-define: 0 */
    function maybeNext() {
        while (running < limit && queue.length) {
            running += 1
            handler.apply(null, queue.shift()).finally(done)
        }
    }
    function done() {
        running -= 1
        maybeNext()
    }
    return function() {
        queue.push(arguments)
        maybeNext()
    }
}
export {ValidationError}
