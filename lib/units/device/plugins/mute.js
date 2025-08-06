import Promise from 'bluebird'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import group from './group.js'
import service from './service.js'
export default syrup.serial()
    .dependency(group)
    .dependency(service)
    .define(function(options, group, service) {
        var log = logger.createLogger('device:plugins:mute')
        switch (options.muteMaster) {
        case 'always':
            log.info('Pre-emptively muting master volume')
            service.setMasterMute(true)
            group.on('leave', function() {
                log.info('Muting master volume again just in case it was re-enabled')
                service.setMasterMute(true)
            })
            break
        case 'inuse':
            log.info('Will mute master volume during use only')
            group.on('join', function() {
                log.info('Muting master volume during use')
                service.setMasterMute(true)
            })
            group.on('leave', function() {
                log.info('Unmuting master volume')
                service.setMasterMute(false)
            })
            break
        case 'never':
        default:
            log.info('Will not mute master volume')
            break
        }
        return Promise.resolve()
    })
