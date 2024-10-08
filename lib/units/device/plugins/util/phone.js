import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../../util/logger.js'
import service from '../service.js'
export default syrup.serial()
    .dependency(service)
    .define(function(options, service) {
    const log = logger.createLogger('device:plugins:phone')
    function fetch() {
        log.info('Fetching phone info')
        return service.getProperties([
            'imei'
            , 'imsi'
            , 'phoneNumber'
            , 'iccid'
            , 'network'
        ])
    }
    return fetch()
})
