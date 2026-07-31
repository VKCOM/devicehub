import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import transport from '../../base-device/support/transport.js'
import service from './service.js'
export default syrup.serial()
    .dependency(transport)
    .dependency(service)
    .define(function(options, transport, service) {
        const log = logger.createLogger('device:plugins:mobile-service')
        function updateMobileServices(data) {
            log.info('Updating mobile services list')
            transport.send([
                wireutil.global,
                wireutil.envelope(new wire.GetServicesAvailabilityMessage(options.serial, data.hasGMS, data.hasHMS))
            ])
        }
        function loadMobileServices() {
            log.info('Loading mobile services list')
            return service.getMobileServices()
                .then(updateMobileServices)
        }
        return loadMobileServices()
    })
