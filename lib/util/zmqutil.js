//
// Copyright © 2022 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
//

// ISSUE-100 (https://github.com/openstf/stf/issues/100)

// In some networks TCP Connection dies if kept idle for long.
// Setting TCP_KEEPALIVE option true, to all the zmq sockets
// won't let it die

import zmq from 'zeromq'
import logger from './logger.js'
const log = logger.createLogger('util:zmqutil')

export const socket = function(...args) {
    let sock = zmq.socket(...args)

  ;['ZMQ_TCP_KEEPALIVE', 'ZMQ_TCP_KEEPALIVE_IDLE', 'ZMQ_IPV6'].forEach(function(opt) {
        if (process.env[opt]) {
            try {
                sock.setsockopt(zmq[opt], Number(process.env[opt]))
            }
            catch (err) {
                log.warn('ZeroMQ library too old, no support for %s', opt)
            }
        }
    })

    return sock
}
