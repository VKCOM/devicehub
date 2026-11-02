/**
 * The TCP endpoint users `adb connect` to. Replaces adbkit's tcpusb Server
 * (dist/adb/tcpusb/server.js) with the same events: 'listening', 'error',
 * 'close' and 'connection' with a BridgeConnection.
 */

import {EventEmitter} from 'node:events'
import net from 'node:net'
import {BridgeConnection, type BridgeOptions} from './connection.ts'

export class BridgeServer extends EventEmitter {
    private server: net.Server
    private connections = new Set<BridgeConnection>()

    constructor(options: BridgeOptions) {
        super()
        // A client may half-close while streams are still sending to it
        this.server = net.createServer({allowHalfOpen: true})
        this.server.on('error', err => this.emit('error', err))
        this.server.on('listening', () => this.emit('listening'))
        this.server.on('close', () => this.emit('close'))
        this.server.on('connection', socket => {
            const connection = new BridgeConnection(socket, options)
            this.connections.add(connection)
            connection.once('end', () => this.connections.delete(connection))
            // Synchronous, so listeners are in place before the first packet is read
            this.emit('connection', connection)
        })
    }

    listen(port: number): this {
        this.server.listen(port)
        return this
    }

    address(): net.AddressInfo | string | null {
        return this.server.address()
    }

    /** Stop accepting connections; 'close' follows once every connection is gone. */
    close(): this {
        this.server.close()
        return this
    }

    /** Drop every client connection. */
    end(): this {
        for (const connection of [...this.connections]) {
            connection.end()
        }
        return this
    }
}
