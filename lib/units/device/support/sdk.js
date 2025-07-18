import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import properties from './properties.js'
export default syrup.serial()
    .dependency(properties)
    .define(function(options, properties) {
        var log = logger.createLogger('device:support:sdk')
        return (function() {
            var level = parseInt(properties['ro.build.version.sdk'], 10)
            var previewDelta = parseInt(properties['ro.build.version.preview_sdk'], 10) || 0
            var previewLevel = level + previewDelta
            var sdk = {
                level: level,
                previewDelta: previewDelta,
                previewLevel: previewLevel,
                release: properties['ro.build.version.release']
            }
            if (sdk.previewDelta) {
                log.info('Supports SDK %s (base %s, preview delta +%s)', sdk.previewLevel, sdk.level, sdk.previewDelta)
            }
            else {
                log.info('Supports SDK %s', sdk.level)
            }
            return sdk
        })()
    })
