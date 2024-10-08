import EventEmitter from 'eventemitter3'
import util from 'util'
import wire from './index.js'
import logger from '../util/logger.js'
const log = logger.createLogger('wire:router')
const {on} = EventEmitter.prototype
function Router() {
    if (!(this instanceof Router)) {
        return new Router()
    }
    EventEmitter.call(this)
}
util.inherits(Router, EventEmitter)
Router.prototype.on = function(message, handler) {
    return on.call(this, message.$code, handler)
}
Router.prototype.removeListener = function(message, handler) {
    return EventEmitter.prototype.removeListener.call(this, message.$code, handler)
}
Router.prototype.handler = function() {
    return function(channel, data) {
        let wrapper = wire.Envelope.decode(data)
        let type = wire.ReverseMessageType[wrapper.type]
        let decodedMessage
        try {
            decodedMessage = wire[type].decode(wrapper.message)
        }
        catch (e) {
            log.error('Received message with type "%s", but cant parse data ' + wrapper.message)
            throw e
        }
        log.info('Received message with type "%s", and data \n %s', type || wrapper.type, JSON.stringify(decodedMessage))
        if (type) {
            this.emit(wrapper.type, wrapper.channel || channel, decodedMessage, data)
            this.emit('message', channel)
        }
        else {
            log.warn('Unknown message type "%d", perhaps we need an update?', wrapper.type)
        }
    }.bind(this)
}
export default Router
