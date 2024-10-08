import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
import EventEmitter from 'eventemitter3'
import logger from '../../../../util/logger.js'
import * as streamutil from '../../../../util/streamutil.js'
import adb from '../../support/adb.js'
import minicap from '../../resources/minicap.js'
import service from '../service.js'
import options from '../screen/options.js'
export default syrup.serial()
    .dependency(adb)
    .dependency(minicap)
    .dependency(service)
    .dependency(options)
    .define(function(options, adb, minicap, service, screenOptions) {
    var log = logger.createLogger('device:plugins:display')
    function Display(id, properties) {
        this.id = id
        this.properties = properties
    }
    util.inherits(Display, EventEmitter)
    Display.prototype.updateRotation = function(newRotation) {
        log.info('Rotation changed to %d', newRotation)
        this.properties.rotation = newRotation
        this.emit('rotationChange', newRotation)
    }
    function infoFromMinicap(id) {
        return minicap.run(util.format('-d %d -i', id))
            .then(streamutil.readAll)
            .then(function(out) {
            var match
            if ((match = /^ERROR: (.*)$/.exec(out))) {
                throw new Error(match[1])
            }
            try {
                return JSON.parse(out)
            }
            catch (e) {
                throw new Error(out.toString())
            }
        })
    }
    function infoFromService(id) {
        return service.getDisplay(id)
    }
    function readInfo(id) {
        log.info('Reading display info')
        return infoFromService(id)
            .catch(function() {
            return infoFromMinicap(id)
        })
            .then(function(properties) {
            properties.url = screenOptions.publicUrl
            return new Display(id, properties)
        })
    }
    return readInfo(0).then(function(display) {
        service.on('rotationChange', function(data) {
            display.updateRotation(data.rotation)
        })
        return display
    })
})
