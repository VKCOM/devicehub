//
// Copyright © 2025 contains code contributed by V Kontakte LLC - Licensed under the Apache license 2.0
//
// This wrapper is designed to make 0MQ v6 backwards compatible with v5

import * as zmq from 'zeromq'
import logger from './logger.js'
import {EventEmitter} from 'events'
const log = logger.createLogger('util:zmqutil')

const socketTypeMap = {
    pub: zmq.Publisher
    , sub: zmq.Subscriber
    , push: zmq.Push
    , pull: zmq.Pull
    , dealer: zmq.Dealer
    , router: zmq.Router
    , pair: zmq.Pair
    , req: zmq.Request
    , reply: zmq.Reply
}

export class SocketWrapper extends EventEmitter {
    #sendQueue = Promise.resolve()

    constructor(type) {
        super()

        if (!(type in socketTypeMap)) {
            throw new Error(`Unsupported socket type: ${type}`)
        }

        this.type = type
        this.isActive = true
        this.endpoints = new Set()

        const SocketClass = socketTypeMap[type]
        this.socket = new SocketClass()
    }

    bindSync = (address) => this.socket.bindSync(address)

    connect(endpoint) {
        this.socket.connect(endpoint)
        this.endpoints.add(endpoint)
        log.verbose('Socket connected to:', endpoint)

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
                    .map(arg => Buffer.isBuffer(arg) ? arg : Buffer.from(String(arg)))
            )
        }
        catch (/** @type {any} */ err) {
            log.error('Error on send:', err?.message || err?.toString() || err)
        }
    }

    send(args) {
        this.#sendQueue = this.#sendQueue.then(() => this.sendAsync(args))
        return this
    }

    close() {
        this.isActive = false
        this.socket.close()

        return this
    }

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
            const iterator = this.socket[Symbol.asyncIterator]()
            let result

            while (this.isActive && !(result = await iterator.next()).done) {
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
            log.error('Error in message receive loop:', err?.message || err?.toString() || err)
            return this.startReceiveLoop()
        }
    }
}

export const socket = (type) => {
    if (!(type in socketTypeMap)) {
        throw new Error(`Unsupported socket type: ${type}`)
    }

    const wrappedSocket = new SocketWrapper(type)
    wrappedSocket.startReceiveLoop()

    return wrappedSocket
}
