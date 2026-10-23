import syrup from '@devicefarmer/stf-syrup'
import {screenWsUrl} from '../../../base-device/support/screen-ws-url.js'
export default syrup.serial()
    .define(function(options) {
        var plugin = Object.create(null)
        plugin.devicePort = 9002
        plugin.publicPort = options.screenPort
        plugin.publicUrl = screenWsUrl(options)
        return plugin
    })
