// @ts-nocheck
import syrup from '@devicefarmer/stf-syrup'
import Promise from 'bluebird'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import {execFileSync} from 'child_process'
import router from '../../base-device/support/router.js'
import transport from '../../base-device/support/transport.js'
import {RebootMessage} from '../../../wire/wire.js'
export default syrup.serial()
    .dependency(router)
    .dependency(transport)
    .define((options, router, transport) => {
        const log = logger.createLogger('device:plugins:reboot')
        router.on(RebootMessage, (channel) => {
            log.important('Rebooting')
            const reply = wireutil.reply(options.serial)
            let udid = options.serial
            execFileSync('pymobiledevice3', ['diagnostics', 'restart', `--udid=${udid}`])
            // TODO: Check real state of reboot
            Promise.delay(1000)
                .then(() => {
                    transport.send([
                        channel,
                        reply.okay()
                    ])
                })
                .error((err) => {
                    log.error('Reboot failed', err.stack)
                    transport.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
    })
