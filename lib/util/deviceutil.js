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
export default deviceutil
