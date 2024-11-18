import syrup from '@devicefarmer/stf-syrup'
import * as deviceData from '@devicefarmer/stf-device-db'
import logger from '../../../../util/logger.js'
import identity from './identity.js'
export default syrup.serial()
    .dependency(identity)
    .define(function(options, identity) {
        const log = logger.createLogger('device:plugins:data')
        function find() {
            let data = deviceData.find(identity)
            if (!data) {
                log.warn('Unable to find device data - ', identity.model)
            }
            return data
        }
        return find()
    })
