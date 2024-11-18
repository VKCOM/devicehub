import syrup from '@devicefarmer/stf-syrup'
import Promise from 'bluebird'
import logger from '../../../util/logger.js'
import srv from '../../../util/srv.js'
import lifecycle from '../../../util/lifecycle.js'
import * as zmqutil from '../../../util/zmqutil.js'
export default syrup.serial()
    .define(options => {
        const log = logger.createLogger('device:support:push')
        // Output
        let push = zmqutil.socket('push')
        return Promise.map(options.endpoints.push, endpoint => {
            return srv.resolve(endpoint).then(records => {
                return srv.attempt(records, record => {
                    log.info('Device sending output to "%s"', record.url)
                    push.connect(record.url)
                    return Promise.resolve(true)
                })
            })
        })
            .catch(function(err) {
                log.fatal('Unable to connect to sub endpoint', err)
                lifecycle.fatal()
            })
            .return(push)
    })
