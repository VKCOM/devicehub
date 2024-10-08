import syrup from '@devicefarmer/stf-syrup'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import logger from '../../../util/logger.js'
import group from './group.js'
import push from '../../base-device/support/push.js'
export default syrup.serial()
    .dependency(group)
    .dependency(push)
    .define((options, group, push) => {
    const log = logger.createLogger('device:plugins:remotedebug')
    const updateRemoteConnectUrl = (group) => {
        push.send([
            group.group
            , wireutil.envelope(new wire.UpdateRemoteConnectUrl(options.serial))
        ])
    }
    group.on('join', (group) => {
        updateRemoteConnectUrl(group)
    })
    group.on('leave', () => {
        // do nothing
    })
})
