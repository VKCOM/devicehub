import util from 'util'
import EventEmitter from 'eventemitter3'
import * as debug$0 from 'debug'
import VncConnection from './connection.js'
var debug = debug$0('vnc:server')
function VncServer(server, options) {
    this.options = options
    this._bound = {
        _listeningListener: this._listeningListener.bind(this),
        _connectionListener: this._connectionListener.bind(this),
        _closeListener: this._closeListener.bind(this),
        _errorListener: this._errorListener.bind(this)
    }
    this.server = server
        .on('listening', this._bound._listeningListener)
        .on('connection', this._bound._connectionListener)
        .on('close', this._bound._closeListener)
        .on('error', this._bound._errorListener)
}
util.inherits(VncServer, EventEmitter)
VncServer.prototype.close = function() {
    this.server.close()
}
VncServer.prototype.listen = function() {
    this.server.listen.apply(this.server, arguments)
}
VncServer.prototype._listeningListener = function() {
    this.emit('listening')
}
VncServer.prototype._connectionListener = function(conn) {
    debug('connection', conn.remoteAddress, conn.remotePort)
    this.emit('connection', new VncConnection(conn, this.options))
}
VncServer.prototype._closeListener = function() {
    this.emit('close')
}
VncServer.prototype._errorListener = function(err) {
    this.emit('error', err)
}
export default VncServer
