import EventEmitter from 'eventemitter3'
import util from 'util'
import wire from './index.js'
import logger from '../util/logger.js'
const log = logger.createLogger('wire:router')

export class WireRouter extends EventEmitter {
    constructor() {
        super()
    }

    /**
     * @typedef {Object} WireMessage
     * @property {string} $code
     */

    /**
     * Overloaded event handler. Accepts either:
     *  - (event: string|symbol, fn: Function, context?: any)
     *  - (message: WireMessage, fn: Function)
     *
     * @param {string|symbol|WireMessage} eventOrMessage - Either a standard event name or a WireMessage object.
     * @param {Function} fn - The listener/callback.
     * @param {any} [context] - (Optional) context if the first argument is string|symbol.
     * @returns {this} The current Router instance.
     */
    on(eventOrMessage, fn, context) {
        if (typeof eventOrMessage !== 'string' && typeof eventOrMessage !== 'symbol' && '$code' in eventOrMessage) {
            // WireMessage scenario
            super.on(eventOrMessage.$code, fn)
        }
        else {
        // string | symbol scenario
            super.on(eventOrMessage, fn, context)
        }
        return this
    }

    /**
     * Overloaded removeListener. Accepts either:
     *  - (event: string|symbol, fn: Function, context?: any)
     *  - (message: WireMessage, fn: Function)
     *
     * @param {string|symbol|WireMessage} eventOrMessage - Either a standard event name or a WireMessage object.
     * @param {Function} fn - The listener/callback to remove.
     * @param {any} [context] - (Optional) context if the first argument is string|symbol.
     * @returns {this} The current Router instance.
     */
    removeListener(eventOrMessage, fn, context) {
        if (typeof eventOrMessage === 'object') {
            // WireMessage scenario
            super.removeListener(eventOrMessage.$code, fn)
        }
        else {
            // string | symbol scenario
            super.removeListener(eventOrMessage, fn, context)
        }
        return this
    }
    handler() {
        return (channel, data) => {
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
            log.info('Received message with type "%s", and data %s', type || wrapper.type, JSON.stringify(decodedMessage))
            if (type) {
                this.emit(wrapper.type, wrapper.channel || channel, decodedMessage, data)
                this.emit('message', channel)
            }
            else {
                log.warn('Unknown message type "%d", perhaps we need an update?', wrapper.type)
            }
        }
    }
}
