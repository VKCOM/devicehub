import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wireutil from '../../../wire/util.js'
import srv from '../../../util/srv.js'
import lifecycle from '../../../util/lifecycle.js'
import * as zmqutil from '../../../util/zmqutil.js'
export default syrup.serial()
    // @ts-ignore
    .define(/** @returns {Promise<zmqutil.SocketWrapper>} */ async(options) => {
        const log = logger.createLogger('base-device:support:sub')
        // Input
        const sub = zmqutil.socket('sub')
        try {
            await Promise.all(options.endpoints.sub.map(endpoint =>
                srv.resolve(endpoint).then(records =>
                    srv.attempt(records, record => {
                        log.info('Receiving input from "%s"', record.url)
                        sub.connect(record.url)
                        return Promise.resolve(true)
                    })
                )
            ))

            // Establish always-on channels
            ;[wireutil.global].forEach(channel => {
                log.info('Subscribing to permanent channel "%s"', channel)
                sub.subscribe(channel)
            })

            return sub
        }
        catch (err) {
            log.fatal('Unable to connect to sub endpoint', err)
            lifecycle.fatal(err)
        }
    })
