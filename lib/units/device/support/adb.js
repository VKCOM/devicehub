import syrup from '@devicefarmer/stf-syrup'
import {createClient} from '@irdk/adbkit'
import adbkit from '@irdk/adbkit'
import logger from '../../../util/logger.js'
import * as promiseutil from '../../../util/promiseutil.js'
export default syrup.serial()
    .define(

        /**
         * @returns {import("@irdk/adbkit").Client}
         */
        function adbmodule(options) {
            var log = logger.createLogger('device:support:adb')
            var adb = createClient({
                host: options.adbHost,
                port: options.adbPort
            })
            adb.Keycode = adbkit.KeyCodes
            function ensureBootComplete() {
                return promiseutil.periodicNotify(adb.getDevice(options.serial).waitBootComplete(), 1000)
                    .progressed(function() {
                        log.info('Waiting for boot to complete')
                    })
                    .timeout(options.bootCompleteTimeout)
            }
            return ensureBootComplete()
                .return(adb)
        })
