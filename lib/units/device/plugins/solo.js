import crypto from 'crypto'
import syrup from '@devicefarmer/stf-syrup'
import wireutil from '../../../wire/util.js'
import transport from '../../base-device/support/transport.js'
import router from '../../base-device/support/router.js'
import identity from './util/identity.js'
import {DeviceDisplayMessage, DeviceIdentityMessage, DevicePhoneMessage, DeviceReadyMessage, ProbeMessage} from '../../../wire/wire.js'
export default syrup.serial()
    .dependency(transport)
    .dependency(router)
    .dependency(identity)
    .define(function(options, transport, router, identity) {
        // The channel should keep the same value between restarts, so that
        // having the client side up to date all the time is not horribly painful.
        function makeChannelId() {
            var hash = crypto.createHash('sha1')
            hash.update(options.serial)
            return hash.digest('base64')
        }
        var channel = makeChannelId()
        router.on(ProbeMessage, function() {
            transport.send([
                wireutil.global,
                wireutil.pack(DeviceIdentityMessage, {
                    serial: options.serial,
                    platform: identity.platform,
                    manufacturer: identity.manufacturer,
                    operator: identity.operator || undefined,
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
                    ram: identity.ram + ''
                })
            ])
        })
        return {
            channel: channel,
            poke: function() {
                transport.send([
                    wireutil.global,
                    wireutil.pack(DeviceReadyMessage, {serial: options.serial, channel})
                ])
            }
        }
    })
