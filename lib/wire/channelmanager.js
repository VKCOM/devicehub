import EventEmitter from 'events'
import util from 'util'

class ChannelManager extends EventEmitter {
    channels = {}

    constructor() {
        super()
    }

    register(id, options) {
        const channel = this.channels[id] = {
            timeout: options.timeout,
            alias: options.alias,
            lastActivity: Date.now(),
            timer: null
        }
        if (channel.alias) {
            // The alias can only be active for a single channel at a time
            if (this.channels[channel.alias]) {
                throw new Error(util.format('Cannot create alias "%s" for "%s"; the channel already exists', channel.alias, id))
            }
            this.channels[channel.alias] = channel
        }
        // Set timer with initial check
        this.check(id)
    }

    unregister(id) {
        const channel = this.channels[id]
        if (channel) {
            delete this.channels[id]
            clearTimeout(channel.timer)
            if (channel.alias) {
                delete this.channels[channel.alias]
            }
        }
    }

    keepalive(id) {
        const channel = this.channels[id]
        if (channel) {
            channel.lastActivity = Date.now()
        }
    }

    updateTimeout(id, timeout) {
        const channel = this.channels[id]
        if (channel) {
            channel.timeout += timeout
        }
    }

    getTimeout(id) {
        const channel = this.channels[id]
        return channel?.timeout || null
    }

    check(id) {
        const channel = this.channels[id]
        const inactivePeriod = Date.now() - channel.lastActivity
        if (inactivePeriod >= channel.timeout) {
            this.unregister(id)
            this.emit('timeout', id)
        }
        else if (channel.timeout > 1) { // 1 is infinity timeout
            const max32Int = 2147483647 // prevent timeout > Int32
            channel.timer = setTimeout(this.check.bind(this, id), Math.min(channel.timeout - inactivePeriod, max32Int))
        }
    }
}

export default ChannelManager
