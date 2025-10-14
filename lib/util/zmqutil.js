//
// Copyright 2025 contains code contributed by V Kontakte LLC - Licensed under the Apache license 2.0
//
// This wrapper is designed to make 0MQ v6 backwards compatible with v5

import * as zmq from 'zeromq'
import logger from './logger.js'
import {EventEmitter} from 'events'
const log = logger.createLogger('util:zmqutil')

const socketTypeMap = {
    pub: zmq.Publisher,
    sub: zmq.Subscriber,
    push: zmq.Push,
    pull: zmq.Pull,
    dealer: zmq.Dealer,
    router: zmq.Router,
    pair: zmq.Pair,
    req: zmq.Request,
    reply: zmq.Reply
}

// Shared ZMQ context to avoid creating multiple contexts with thread pools
// Each context creates ioThreads (4 by default), so sharing saves resources
/** @type {zmq.Context | null} */
let sharedContext = null
const getSharedContext = () => {
    if (!sharedContext) {
        sharedContext = new zmq.Context({
            blocky: true,
            ioThreads: 4,
            ipv6: true,
            maxSockets: 8192,
        })
    }
    return sharedContext
}

export class SocketWrapper extends EventEmitter {
    #sendQueue = Promise.resolve()

    /** @type {AsyncIterator<any, any, undefined> | null} */
    #iterator = null

    /**
     * @param {string} type
     * @param {number} keepAliveInterval
     */
    constructor(type, keepAliveInterval = 30) {
        super()

        if (!(type in socketTypeMap)) {
            throw new Error(`Unsupported socket type: ${type}`)
        }

        this.type = type
        this.isActive = true
        this.endpoints = new Set()

        // @ts-ignore
        const SocketClass = socketTypeMap[type]
        this.socket = new SocketClass({
            tcpKeepalive: 1,
            tcpKeepaliveIdle: keepAliveInterval,
            tcpKeepaliveInterval: keepAliveInterval,
            tcpKeepaliveCount: 100
        }, getSharedContext())
    }

    bindSync = (address) => this.socket.bindSync(address)

    connect(endpoint) {
        this.socket.connect(endpoint)
        this.endpoints.add(endpoint)
        log.verbose(`Socket connected to: ${endpoint}`)

        return this
    }

    subscribe(topic) {
        if (this.type === 'sub') {
            this.socket.subscribe(
                typeof topic === 'string' ? Buffer.from(topic) : topic
            )
        }

        return this
    }

    unsubscribe(topic) {
        if (this.type === 'sub') {
            this.socket.unsubscribe(
                typeof topic === 'string' ? Buffer.from(topic) : topic
            )
        }
        return this
    }

    async sendAsync(args) {
        try {
            await this.socket.send(
                (Array.isArray(args) ? args : [args])
                    .map(arg => Buffer.isBuffer(arg) || ArrayBuffer.isView(arg) ? arg : Buffer.from(String(arg)))
            )
        }
        catch (/** @type {any} */ err) {
            log.error('Error on send: %s', err?.message || err?.toString() || JSON.stringify(err))
            throw err // Re-throw to properly handle in the promise chain
        }
    }

    /**
     * @param {any} args
     */
    send(args) {
        this.#sendQueue = this.#sendQueue.then(() => this.sendAsync(args))
        return this
    }

    async close() {
        this.isActive = false

        // Close async iterator if it exists
        if (this.#iterator && typeof this.#iterator.return === 'function') {
            try {
                await this.#iterator.return()
            }
            catch {
                // Ignore errors during cleanup
            }
            this.#iterator = null
        }

        // Wait for send queue to drain before closing socket
        try {
            await this.#sendQueue.catch(() => {})
        }
        catch {
            // Ignore errors during cleanup
        }

        this.socket.close()
        this.removeAllListeners()

        return this
    }

    /**
     *
     * @returns {Promise<void>}
     */
    async startReceiveLoop() {
        const isValidType =
            this.type === 'sub' ||
            this.type === 'pull' ||
            this.type === 'dealer' ||
            this.type === 'router' ||
            this.type === 'reply'

        if (!this.isActive || !isValidType) {
            return
        }

        try {
            this.#iterator = this.socket[Symbol.asyncIterator]()
            let result

            while (this.isActive && this.#iterator && !(result = await this.#iterator.next()).done) {
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
        catch (/** @type {any} */ err) {
            log.error('Error in message receive loop: %s, %s', err?.message || err?.toString() || err, err.stack)
            return this.startReceiveLoop()
        }
    }
}

export const socket = (type) => {
    if (!(type in socketTypeMap)) {
        throw new Error(`Unsupported socket type: ${type}`)
    }

    const wrappedSocket = new SocketWrapper(type, Number(process.env.ZMQ_KEEPALIVE_INTERVAL || 30))
    wrappedSocket.startReceiveLoop()

    return wrappedSocket
}
