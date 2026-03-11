//
// Copyright 2025 contains code contributed by V Kontakte LLC - Licensed under the Apache license 2.0
//
// This wrapper is designed to make 0MQ v6 backwards compatible with v5

import {
    Publisher,
    Subscriber,
    Push,
    Pull,
    Dealer,
    Router,
    Pair,
    Request,
    Reply,
    Context
} from 'zeromq'
import logger from './logger.js'
import {EventEmitter} from 'events'
const log = logger.createLogger('util:zmqutil')

const socketTypeMap = {
    pub: Publisher,
    sub: Subscriber,
    push: Push,
    pull: Pull,
    dealer: Dealer,
    router: Router,
    pair: Pair,
    req: Request,
    reply: Reply
} as const

const sendHwmByType = {
    pub: 5000,
    push: 1000,
    dealer: 5000,
    router: 5000,
    req: 1000,
    pair: 1000
} as const satisfies Partial<Record<SocketType, number>>

type SocketType = keyof typeof socketTypeMap

export class SocketWrapper extends EventEmitter {
    static sharedContext: Context

    // Shared ZMQ context to avoid creating multiple contexts with thread pools
    // Each context creates ioThreads (4 by default), so sharing saves resources
    static getSharedContext = () => {
        if (!SocketWrapper.sharedContext) {
            SocketWrapper.sharedContext = new Context({
                blocky: true,
                ioThreads: 4,
                ipv6: true,
                maxSockets: 8192,
            })
        }

        return SocketWrapper.sharedContext
    }

    private sendQueue = Promise.resolve()
    private iterator: AsyncIterator<any, any, undefined> | null = null

    public type: string
    public isActive = true
    public endpoints = new Set()
    public socket: InstanceType<typeof socketTypeMap[SocketType]>

    constructor(type: SocketType, keepAliveInterval = 30) {
        super()

        if (!(type in socketTypeMap)) {
            throw new Error(`Unsupported socket type: ${type}`)
        }

        this.type = type

        const SocketClass = socketTypeMap[type]
        this.socket = new SocketClass({
            linger: 2000,
            tcpKeepalive: 1,
            tcpKeepaliveIdle: keepAliveInterval,
            tcpKeepaliveInterval: keepAliveInterval,
            tcpKeepaliveCount: 100,
            context: SocketWrapper.getSharedContext(),
            ...(
                type in sendHwmByType && {
                    sendHighWaterMark: sendHwmByType[type as keyof typeof sendHwmByType]
                }
            )
        })
    }

    bindSync = (address: string) => this.socket.bindSync(address)

    connect(endpoint: string) {
        this.socket.connect(endpoint)
        this.endpoints.add(endpoint)
        log.verbose(`Socket connected to: ${endpoint}`)

        return this
    }

    subscribe(topic: string | Buffer) {
        if (this.type === 'sub') {
            (this.socket as Subscriber).subscribe(
                typeof topic === 'string' ? Buffer.from(topic) : topic
            )
        }

        return this
    }

    unsubscribe(topic: string | Buffer) {
        if (this.type === 'sub') {
            (this.socket as Subscriber).unsubscribe(
                typeof topic === 'string' ? Buffer.from(topic) : topic
            )
        }
        return this
    }

    async sendAsync(args: any | Array<any>) {
        try {
            await (this.socket as Publisher).send(
                (Array.isArray(args) ? args : [args])
                    .map(arg => Buffer.isBuffer(arg) || ArrayBuffer.isView(arg) ? arg : Buffer.from(String(arg)))
            )
        }
        catch (err: any) {
            log.error('Error on send: %s', err?.message || err?.toString() || JSON.stringify(err))
            throw err // Re-throw to properly handle in the promise chain
        }
    }

    send(args: any | Array<any>) {
        this.sendQueue = this.sendQueue.then(() => this.sendAsync(args))
        return this
    }

    async close() {
        this.isActive = false

        // Close async iterator if it exists
        if (this.iterator && typeof this.iterator.return === 'function') {
            try {
                await this.iterator.return()
            }
            catch {
                // Ignore errors during cleanup
            }
            this.iterator = null
        }

        // Wait for send queue to drain before closing socket
        try {
            await this.sendQueue.catch(() => {})
        }
        catch {
            // Ignore errors during cleanup
        }

        this.socket.close()
        this.removeAllListeners()

        return this
    }

    async startReceiveLoop(): Promise<void> {
        const isValidType = [
            'sub',
            'pull',
            'dealer',
            'router',
            'reply'
        ].includes(this.type)

        if (!this.isActive || !isValidType) {
            return
        }

        try {
            this.iterator = (this.socket as Subscriber)[Symbol.asyncIterator]() as typeof this.iterator
            let result

            while (this.isActive && this.iterator && !(result = await this.iterator.next()).done) {
                const message = result.value

                if (Array.isArray(message) && !!message[0]?.toString) {
                    super.emit(
                        'message'
                        , message[0].toString()
                        , ...message.slice(1)
                    )
                }
            }
        }
        catch (err: any) {
            log.error('Error in message receive loop: %s, %s', err?.message || err?.toString() || err, err.stack)
            return this.startReceiveLoop()
        }
    }
}

export const socket = (type: SocketType) => {
    if (!(type in socketTypeMap)) {
        throw new Error(`Unsupported socket type: ${type}`)
    }

    const wrappedSocket = new SocketWrapper(type, Number(process.env.ZMQ_KEEPALIVE_INTERVAL || 30))
    wrappedSocket.startReceiveLoop()

    return wrappedSocket
}
