import devicesWatcher from './watchers/devices.js'
import lifecycle from '../../util/lifecycle.js'
import usersWatcher from './watchers/users.js'
import logger from '../../util/logger.js'
import db from '../../db/index.js'

export default (async function(options) {
    const log = logger.createLogger('groups-engine')

    const {
        push
        , pushdev
        , sub
        , subdev
        , channelRouter
    } = await db.createZMQSockets(options.endpoints, log)
    await db.connect(push, pushdev, channelRouter)

    devicesWatcher(push, pushdev, channelRouter)
    usersWatcher(pushdev)

    lifecycle.observe(() =>
        [push, sub, pushdev, subdev].forEach((sock) => sock.close())
    )
    log.info('Groups engine started')
})
