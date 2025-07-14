import events from 'events'
import util from 'util'
function ChannelManager() {
    events.EventEmitter.call(this)
    this.channels = Object.create(null)
}
util.inherits(ChannelManager, events.EventEmitter)
ChannelManager.prototype.register = function(id, options) {
    let channel = this.channels[id] = {
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
ChannelManager.prototype.unregister = function(id) {
    let channel = this.channels[id]
    if (channel) {
        delete this.channels[id]
        clearTimeout(channel.timer)
        if (channel.alias) {
            delete this.channels[channel.alias]
        }
    }
}
ChannelManager.prototype.keepalive = function(id) {
    let channel = this.channels[id]
    if (channel) {
        channel.lastActivity = Date.now()
    }
}
ChannelManager.prototype.updateTimeout = function(id, timeout) {
    let channel = this.channels[id]
    if (channel) {
        channel.timeout += timeout
    }
}
ChannelManager.prototype.getTimeout = function(id) {
    let channel = this.channels[id]
    if (channel) {
        return channel.timeout
    }
    else {
        return null
    }
}
ChannelManager.prototype.check = function(id) {
    let channel = this.channels[id]
    let inactivePeriod = Date.now() - channel.lastActivity
    if (inactivePeriod >= channel.timeout) {
        this.unregister(id)
        this.emit('timeout', id)
    }
    else if (channel.timeout > 1) { // 1 is infinity timeout
        const max32Int = 2147483647 // prevent timeout > Int32
        channel.timer = setTimeout(this.check.bind(this, id), Math.min(channel.timeout - inactivePeriod, max32Int))
    }
}
export default ChannelManager
