//
// The unit-wide broadcast fan-out for the websocket unit.
//
// A single WireRouter decodes each inbound broadcast once and calls dispatch();
// the hub fans the decoded message out to each connection's per-type handler.
// A connection registers a plain map of `messageTypeName -> handler` once on
// connect and is removed on disconnect — no per-client router, no per-client
// transport subscriptions.
//
import logger from '../../../util/logger.js'

const log = logger.createLogger('websocket:clientDispatcher')

// A handler for one decoded broadcast message, scoped to one connection. Mirrors
// the WireRouter callback shape: (channel, message).
export type MessageHandler = (channel: string, message: any) => void

// The per-connection handler map: message type name -> handler.
export type HandlerMap = Record<string, MessageHandler>

export class ClientDispatcher {
    private connections = new Map<string, HandlerMap>()

    // Register a connection's handler map. Called once per socket on connect.
    add(id: string, handlers: HandlerMap): void {
        this.connections.set(id, handlers)
    }

    // Drop a connection on disconnect so it stops receiving broadcasts.
    remove(id: string): void {
        this.connections.delete(id)
    }

    get size(): number {
        return this.connections.size
    }

    // Fan a decoded broadcast out to every connection that handles `typeName`.
    // A throwing handler is isolated so it cannot starve the other connections.
    dispatch(typeName: string, channel: string, message: any): void {
        for (const handlers of this.connections.values()) {
            const handler = handlers[typeName]
            if (!handler) {
                continue
            }
            try {
                handler(channel, message)
            }
            catch (err: any) {
                log.error('Broadcast handler for %s failed: %s', typeName, err?.message || err)
            }
        }
    }
}
