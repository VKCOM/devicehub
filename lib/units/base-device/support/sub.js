import syrup from '@devicefarmer/stf-syrup'
import Promise from 'bluebird'
import logger from '../../../util/logger.js'
import wireutil from '../../../wire/util.js'
import srv from '../../../util/srv.js'
import lifecycle from '../../../util/lifecycle.js'
import * as zmqutil from '../../../util/zmqutil.js'
export default syrup.serial()
    .define((options) => {
        const log = logger.createLogger('device:support:sub')
        // Input
        let sub = zmqutil.socket('sub')
        return Promise.map(options.endpoints.sub, endpoint => {
            return srv.resolve(endpoint).then(records => {
                return srv.attempt(records, record => {
                    log.info('Receiving input from "%s"', record.url)
                    sub.connect(record.url)
                    return Promise.resolve(true)
                })
            })
        })
            .then(() => {
                // Establish always-on channels
                [wireutil.global].forEach(channel => {
                    log.info('Subscribing to permanent channel "%s"', channel)
                    sub.subscribe(channel)
                })
            })
            .catch(function(err) {
                log.fatal('Unable to connect to sub endpoint', err)
                lifecycle.fatal(err)
            })
            .return(sub)
    })
