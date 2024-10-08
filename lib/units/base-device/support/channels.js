import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import ChannelManager from '../../../wire/channelmanager.js'
export default syrup.serial()
    .define(() => {
    const log = logger.createLogger('device:support:channels')
    let channels = new ChannelManager()
    channels.on('timeout', channel => {
        log.info('Channel "%s" timed out', channel)
    })
    return channels
})
