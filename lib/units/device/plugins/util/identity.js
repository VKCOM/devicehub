import syrup from '@devicefarmer/stf-syrup'
import devutil from '../../../../util/devutil.js'
import logger from '../../../../util/logger.js'
import properties from '../../support/properties.js'
import display from './display.js'
import phone from './phone.js'
export default syrup.serial()
    .dependency(properties)
    .dependency(display)
    .dependency(phone)
    .define(function(options, properties, display, phone) {
        var log = logger.createLogger('device:plugins:identity')
        function solve() {
            log.info('Solving identity')
            let identity = devutil.makeIdentity(options.serial, properties)
            identity.display = display.properties
            identity.phone = phone
            if (options.deviceName) {
                identity.module = options.deviceName
            }
            return identity
        }
        return solve()
    })
