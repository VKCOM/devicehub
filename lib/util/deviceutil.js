import logger from './logger.js'
var log = logger.createLogger('util:deviceutil')
var deviceutil = Object.create(null)
deviceutil.isOwnedByUser = function(device, user) {
    return device.present &&
        device.ready &&
        device.owner &&
        (device.owner.email === user.email || user.privilege === 'admin') &&
        device.using
}
deviceutil.isAddable = function(device, user) {
    return device.present &&
        device.ready &&
        !device.using &&
        !device.owner
}

/** @returns {() => void} stop */
deviceutil.progressUp = (sendProgress, value = 0, incr = 10, max = 50) => {
    let timer
    const loop = (sendProgress, value, incr, max) => {
        timer = setTimeout(() => {
            value += incr
            if (value >= max) {
                sendProgress('pushing_app', max)
                return
            }
            sendProgress('pushing_app', value)
            loop(value, incr, max)
        }, 500)
    }
    loop(sendProgress, value, incr, max)
    return () => clearTimeout(timer)
}
export default deviceutil
