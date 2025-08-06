import syrup from '@devicefarmer/stf-syrup'
import devutil from '../../../../util/devutil.js'
import logger from '../../../../util/logger.js'
import display from './display.js'
import phone from './phone.js'
export default syrup.serial()
    .dependency(display)
    .dependency(phone)
    .dependency(devutil)
    .define(function(options, display, phone, devutil) {
        var log = logger.createLogger('device:plugins:identity')

        async function solve() {
            log.info('Solving identity')
            let identity = await devutil.makeIdentity()
            identity.display = display.properties
            identity.phone = phone
            if (options.deviceName) {
                identity.module = options.deviceName
            }
            return identity
        }

        return solve()
    })
