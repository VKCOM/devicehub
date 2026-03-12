import devicesWatcher from './watchers/devices.js'
import lifecycle from '../../util/lifecycle.js'
import logger from '../../util/logger.js'
import db from '../../db/index.js'

export default (async function(options) {
    const log = logger.createLogger('groups-engine')

    const {
        push
        , pushdev
        , sub
        , channelRouter
    } = await db.createZMQSockets(options.endpoints, log)
    await db.connect()

    devicesWatcher(push, pushdev, channelRouter, sub)

    lifecycle.observe(() => {
        push.close()
        pushdev.close()
        if (sub) {
            sub.close()
        }
    })
    log.info('Groups engine started')
})
