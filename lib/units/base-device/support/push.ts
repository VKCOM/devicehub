import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import srv from '../../../util/srv.ts'
import lifecycle from '../../../util/lifecycle.js'
import * as zmqutil from '../../../util/zmqutil.js'
export default syrup.serial().define(
    async(options: {
        endpoints: {
            push: string[];
        };
    }) => {
        const log = logger.createLogger('device:support:push')
        // Output
        try {
            const push = zmqutil.socket('push')
            await Promise.all(
                options.endpoints.push.map((endpoint) =>
                    srv.resolve(endpoint).then((records) =>
                        srv.attempt(records, (record) => {
                            log.info(
                                'Device sending output to "%s"',
                                record.url
                            )
                            push.connect(record.url)
                            return Promise.resolve(true)
                        })
                    )
                )
            )

            return push
        }
        catch (err) {
            log.fatal('Unable to connect to sub endpoint', err)
            lifecycle.fatal()
        }
    }
)
