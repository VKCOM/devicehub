import EventEmitter from 'eventemitter3'
import net, { Server, Socket } from 'net'
import VncConnection from './connection.js'
import logger from '../../../../../util/logger.js'

const _logger = logger.createLogger('vnc:server')
const debug = _logger.debug.bind(_logger)

interface SecurityMethod {
  type: number
  challenge?: Buffer
  auth: (data: any) => Promise<void>
}

interface VncServerOptions {
  width: number
  height: number
  name: string
  challenge?: Buffer
  security?: SecurityMethod[]
}

class VncServer extends EventEmitter {
  options: VncServerOptions
  server: Server

  constructor(options: VncServerOptions) {
    super()
    this.options = options
    this.server = net.createServer({
        allowHalfOpen: true
    })
      .on('listening', this._listeningListener)
      .on('connection', this._connectionListener)
      .on('close', this._closeListener)
      .on('error', this._errorListener)
  }

  close(): void {
    this.server.close()
  }

  listen(...args: any[]): void {
    this.server.listen(...args)
  }

  private _listeningListener = (): void => {
    this.emit('listening')
  }

  private _connectionListener = (conn: Socket): void => {
    debug('connection %s %s', conn.remoteAddress, conn.remotePort)
    this.emit('connection', new VncConnection(conn, this.options))
  }

  private _closeListener = (): void => {
    this.emit('close')
  }

  private _errorListener = (err: Error): void => {
    this.emit('error', err)
  }
}

export default VncServer

