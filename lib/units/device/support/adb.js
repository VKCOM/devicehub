import syrup from '@devicefarmer/stf-syrup'
import {createClient} from '@u4/adbkit'
import logger from '../../../util/logger.js'
import * as promiseutil from '../../../util/promiseutil.js'

/*
 * The provider owns the ADB server (see its --adb-autostart). By default adbkit
 * runs `adb start-server` whenever a connection is refused: every worker would
 * then start its own server along with the provider, and the losers of that race
 * would linger or, with another adb version in PATH, kill the winner.
 */
export const createWorkerAdbClient = ({adbHost, adbPort}) => {
    const client = createClient({
        host: adbHost,
        port: adbPort,
        bin: ''
    })

    // Without a binary adbkit reports a refused connection as "No bin specified"
    const connection = client.connection.bind(client)
    client.connection = () => connection().catch(err => {
        if (err?.message === 'No bin specified') {
            throw new Error(`ADB server ${adbHost}:${adbPort} is not running`)
        }
        throw err
    })

    return client
}

export default syrup.serial()
    .define(

        /**
         * @returns {import("@u4/adbkit").Client}
         */
        function adbmodule(options) {
            var log = logger.createLogger('device:support:adb')

            const adb = createWorkerAdbClient(options)
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
