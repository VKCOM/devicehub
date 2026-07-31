import devicesWatcher from './watchers/devices.js'
import lifecycle from '../../util/lifecycle.js'
import logger from '../../util/logger.js'
import srv from '../../util/srv.js'
import db from '../../db/index.js'
import {DealerSocket} from '../../util/zmqsocket.js'
import {AppTransport} from '../../wire/app-transport.js'
import {TransactionManager} from '../../wire/transmanager.js'

export default (async function(options) {
    const log = logger.createLogger('groups-engine')

    // A single DEALER to the proxy carries the group/user/device change broadcasts
    // (as [B, ...]) this unit publishes, and the device Ungroup transactions it
    // runs when releasing control. AppTransport wraps it; TransactionManager owns
    // request/reply correlation.
    const dealer = new DealerSocket({probeRouter: true})
    try {
        await Promise.all(options.endpoints.proxy.map((endpoint) =>
            srv.resolve(endpoint).then((records) =>
                srv.attempt(records, (record) => {
                    log.info('Sending to proxy "%s"', record.url)
                    dealer.connect(record.url)
                    return Promise.resolve(true)
                })
            )
        ))
    }
    catch (err) {
        log.fatal('Unable to connect to proxy endpoint: %s', (err && err.message) || err)
        return lifecycle.fatal()
    }

    const transport = new AppTransport(dealer)
    const txmanager = new TransactionManager(transport)

    // The group/user DB change handlers publish broadcasts (and run Ungroup
    // transactions) over this same transport.
    await db.connect({transport, txmanager})

    devicesWatcher(transport, txmanager)

    lifecycle.observe(() => {
        try {
            transport.close()
        }
        catch {
            // No-op
        }
    })
    log.info('Groups engine started')
})
