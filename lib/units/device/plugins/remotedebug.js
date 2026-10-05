import syrup from '@devicefarmer/stf-syrup'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import group from './group.js'
import transport from '../../base-device/support/transport.js'
export default syrup.serial()
    .dependency(group)
    .dependency(transport)
    .define((options, group, transport) => {
        const updateRemoteConnectUrl = (group) => {
            transport.send([
                group.group,
                wireutil.envelope(new wire.UpdateRemoteConnectUrl(options.serial))
            ])
        }
        group.on('join', (group) => {
            updateRemoteConnectUrl(group)
        })
    })
