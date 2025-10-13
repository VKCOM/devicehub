import devicesWatcher from './watchers/devices.js'
import lifecycle from '../../util/lifecycle.js'
import logger from '../../util/logger.js'
import db from '../../db/index.js'

export default (async function(options) {
    const log = logger.createLogger('groups-engine')

    const {
        push
        , pushdev
        , channelRouter
    } = await db.createZMQSockets(options.endpoints, log)
    await db.connect()

    devicesWatcher(push, pushdev, channelRouter)

    lifecycle.observe(() =>
        [push, pushdev].forEach((sock) => sock.close())
    )
    log.info('Groups engine started')
})
