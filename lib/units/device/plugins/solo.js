import crypto from 'crypto'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import sub from '../../base-device/support/sub.js'
import push from '../../base-device/support/push.js'
import router from '../../base-device/support/router.js'
import identity from './util/identity.js'
import {DeviceDisplayMessage, DeviceIdentityMessage, DevicePhoneMessage, ProbeMessage} from '../../../wire/wire.js'
export default syrup.serial()
    .dependency(sub)
    .dependency(push)
    .dependency(router)
    .dependency(identity)
    .define(function(options, sub, push, router, identity) {
        var log = logger.createLogger('device:plugins:solo')
        // The channel should keep the same value between restarts, so that
        // having the client side up to date all the time is not horribly painful.
        function makeChannelId() {
            var hash = crypto.createHash('sha1')
            hash.update(options.serial)
            return hash.digest('base64')
        }
        var channel = makeChannelId()
        log.info('Subscribing to permanent channel "%s"', channel)
        sub.subscribe(channel)
        router.on(ProbeMessage, function() {
            push.send([
                wireutil.global,
                wireutil.pack(DeviceIdentityMessage, {
                    serial: options.serial,
                    platform: identity.platform,
                    manufacturer: identity.manufacturer,
                    operator: identity.operator,
                    model: identity.model,
                    version: identity.version,
                    abi: identity.abi,
                    sdk: identity.sdk,
                    display: DeviceDisplayMessage.create(identity.display),
                    phone: DevicePhoneMessage.create(identity.phone),
                    product: identity.product,
                    cpuPlatform: identity.cpuPlatform,
                    openGLESVersion: identity.openGLESVersion,
                    marketName: identity.marketName,
                    macAddress: identity.macAddress,
                    ram: identity.ram
                })
            ])
        })
        return {
            channel: channel,
            poke: function() {
                push.send([
                    wireutil.global,
                    wireutil.envelope(new wire.DeviceReadyMessage(options.serial, channel))
                ])
            }
        }
    })
