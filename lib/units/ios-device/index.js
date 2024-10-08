const syrup = require('@devicefarmer/stf-syrup')
const logger = require('../../util/logger')
const lifecycle = require('../../util/lifecycle')

module.exports = function(options) {
  // Show serial number in logs
  logger.setGlobalIdentifier(options.serial)

    return syrup.serial()
    .dependency(require('./plugins/logger'))
    .define(function(options) {
      const log = logger.createLogger('ios-device')
      log.info('Preparing device options: ', options)

      return syrup.serial()
        .dependency(require('./plugins/heartbeat'))
        .dependency(require('./plugins/solo'))
        .dependency(require('./plugins/info/'))
        .dependency(require('./plugins/wda'))
        .dependency(require('../base-device/support/push'))
        .dependency(require('../base-device/support/sub'))
        .dependency(require('./plugins/group'))
        .dependency(require('./support/storage'))
        .dependency(require('./plugins/devicelog'))
        .dependency(require('./plugins/screen/stream'))
        .dependency(require('./plugins/install'))
        .dependency(require('./plugins/reboot'))
        .dependency(require('./plugins/clipboard'))
        .dependency(require('./plugins/remotedebug'))
        .define(function(options, heartbeat, solo, info, wda) {
          if (process.send) {
            process.send('ready')
          }

          try {
            wda.connect()
            solo.poke()
          }
          catch(err) {
            log.error('err :', err)
          }
        })
        .consume(options)
    })
    .consume(options)
    .catch((err) => {
      lifecycle.fatal(err)
    })
}
