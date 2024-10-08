import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import push from '../../base-device/support/push.js'
import service from './service.js'
export default syrup.serial()
    .dependency(push)
    .dependency(service)
    .define(function(options, push, service) {
    const log = logger.createLogger('device:plugins:mobile-service')
    function updateMobileServices(data) {
        log.info('Updating mobile services list')
        push.send([
            wireutil.global
            , wireutil.envelope(new wire.GetServicesAvailabilityMessage(options.serial, data.hasGMS, data.hasHMS))
        ])
    }
    function loadMobileServices() {
        log.info('Loading mobile services list')
        return service.getMobileServices()
            .then(updateMobileServices)
    }
    return loadMobileServices()
})
