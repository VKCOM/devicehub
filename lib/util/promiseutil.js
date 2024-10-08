import Promise from 'bluebird'
export const periodicNotify = function(promise, interval) {
    var resolver = Promise.defer()
    function notify() {
        resolver.progress()
    }
    var timer = setInterval(notify, interval)
    function resolve(value) {
        resolver.resolve(value)
    }
    function reject(err) {
        resolver.reject(err)
    }
    promise.then(resolve, reject)
    return resolver.promise.finally(function() {
        clearInterval(timer)
    })
}
export const sleep = function(timeout) {
    var promise = Promise.defer()
    setTimeout(promise.resolve, timeout)
    return promise.promise
}
