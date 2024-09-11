const syrup = require('@devicefarmer/stf-syrup')
const Promise = require('bluebird')
const logger = require('../../../util/logger')
const wire = require('../../../wire')
const wireutil = require('../../../wire/util')
const {exec} = require('child_process')

module.exports = syrup.serial()
  .dependency(require('../../base-device/support/router'))
  .dependency(require('../../base-device/support/push'))
  .define((options, router, push) => {
    const log = logger.createLogger('device:plugins:reboot')

    router.on(wire.RebootMessage, (channel) => {
        const reply = wireutil.reply(options.serial)
        let udid = options.serial
        exec(`idevicediagnostics restart --udid=${udid}`) // this command that launches restart
         Promise.delay(5000)
         .then(() => {
            push.send([
              channel
            , reply.okay()
            ])
          })
          .error((err) => {
            log.error('Reboot failed', err.stack)
            push.send([
              channel
            , reply.fail(err.message)
            ])
          })
    })
  })
