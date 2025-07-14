// @ts-nocheck
import syrup from '@devicefarmer/stf-syrup'
import Promise from 'bluebird'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import {execFileSync} from 'child_process'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
export default syrup.serial()
    .dependency(router)
    .dependency(push)
    .define((options, router, push) => {
        const log = logger.createLogger('device:plugins:reboot')
        router.on(wire.RebootMessage, (channel) => {
            log.important('Rebooting')
            const reply = wireutil.reply(options.serial)
            let udid = options.serial
            execFileSync('pymobiledevice3', ['diagnostics', 'restart', `--udid=${udid}`])
            // TODO: Check real state of reboot
            Promise.delay(1000)
                .then(() => {
                    push.send([
                        channel,
                        reply.okay()
                    ])
                })
                .error((err) => {
                    log.error('Reboot failed', err.stack)
                    push.send([
                        channel,
                        reply.fail(err.message)
                    ])
                })
        })
    })
