import os from 'os'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import srv from '../../../util/srv.js'
import lifecycle from '../../../util/lifecycle.js'
import {DealerSocket} from '../../../util/zmqsocket.js'
import {deviceKey} from '../../../wire/frame.js'
import {DeviceTransport} from '../../../wire/device-transport.js'

const log = logger.createLogger('base-device:support:transport')

export {DeviceTransport} from '../../../wire/device-transport.js'

export interface DeviceTransportOptions {
    serial: string
    provider?: string
    endpoints: {
        // processor ROUTER endpoint(s) to connect to (SRV-resolvable).
        processor: string[]
    }
}

export default syrup.serial().define(
    async(options: DeviceTransportOptions): Promise<DeviceTransport> => {
        const providerName = options.provider ?? os.hostname()
        const routingId = deviceKey(providerName, options.serial)

        const dealer = new DealerSocket({routingId, probeRouter: true})
        try {
            await Promise.all(options.endpoints.processor.map(endpoint =>
                srv.resolve(endpoint).then(records =>
                    srv.attempt(records, record => {
                        log.info('Device "%s" connecting to processor "%s"', routingId, record.url)
                        dealer.connect(record.url)
                        return Promise.resolve(true)
                    })
                )
            ))
        }
        catch (err: any) {
            log.fatal('Unable to connect to processor endpoint: %s', err?.message || err)
            return lifecycle.fatal()
        }

        const transport = new DeviceTransport(dealer)
        lifecycle.observe(() => transport.close())
        return transport
    }
)
