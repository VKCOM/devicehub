const syrup = require('@devicefarmer/stf-syrup')
const wire = require('../../../wire')
const wireutil = require('../../../wire/util')
const logger = require('../../../util/logger')
const lifecycle = require('../../../util/lifecycle')

module.exports = syrup.serial()
  .dependency(require('../../base-device/support/push'))
  .dependency(require('./group'))
  .define(function(options, push, group) {
    const log = logger.createLogger('device:plugins:notifier')
    const notifier = {}

    notifier.setDeviceTemporaryUnavailable = function(err) {
      group.get()
        .then((currentGroup) => {
          push.send([
            currentGroup.group
            , wireutil.envelope(new wire.TemporarilyUnavailableMessage(
              options.serial
            ))
          ])
        })
        .catch(err => {
          log.error('Cannot set device temporary unavailable', err)
        })
    }

    notifier.setDeviceAbsent = function(err) {
      if (err.statusCode) {
        push.send([
          wireutil.global
          , wireutil.envelope(new wire.DeviceStatusMessage(
            options.serial,
            1
          ))
        ])
      }
 else {
        push.send([
          wireutil.global
          , wireutil.envelope(new wire.DeviceAbsentMessage(
            options.serial
          ))
        ])
      }

      lifecycle.graceful(err)
    }

    return notifier
  })
