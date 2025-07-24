import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../../util/logger.js'
import urlformat from '../../../base-device/support/urlformat.js'
import connector, {DEVICE_TYPE} from '../../../base-device/support/connector.js'
import net from 'net'
import lifecycle from '../../../../util/lifecycle.js'
import {promisify} from 'node:util'

const tcpProxy = (host, port, log) => {
    const server = net.createServer()
    const sockets = {
        local: null,
        external: null
    }

    /** @type {net.Socket | null} */
    let client // only one active external connection
    server.on('connection', (clientSocket) => {
        const remoteIp = clientSocket.remoteAddress || ''
        const isLocal = ['127.0.0.1', '::1', '::ffff:127.0.0.1', server.address()].includes(remoteIp)
        if ((!isLocal && client) || isLocal && sockets.local) {
            return clientSocket.end()
        }

        clientSocket.setNoDelay(true)
        clientSocket.setKeepAlive(true, 30_000)

        const deviceSocket = net.createConnection({host, port, allowHalfOpen: true})
        deviceSocket.setNoDelay(true)
        deviceSocket.setKeepAlive(true, 30_000)

        if (isLocal) {
            // @ts-ignore
            sockets.local = deviceSocket
        }
        else {
            // @ts-ignore
            sockets.external = deviceSocket
            client = clientSocket
        }

        clientSocket.pipe(deviceSocket, {end: false})
        deviceSocket.pipe(clientSocket, {end: false})

        log.info('New SDB connection %s', isLocal ? '[ LOCAL ]' : `[ ${remoteIp} ]`)

        clientSocket.on('close', (hadError) => {
            log.info('SDB connection closed %s %s', isLocal ? '[ LOCAL ]' : `[ ${remoteIp} ]`, hadError ? '[ ERROR ]' : '')
            if (!isLocal) {
                client = null
            }
            // @ts-ignore
            sockets[isLocal ? 'local' : 'external']?.end()
            sockets[isLocal ? 'local' : 'external'] = null
        })

        clientSocket.on('error', (err) => {
            log.error('SDB client socket error:', err.message)
            clientSocket.end()
            // @ts-ignore
            sockets[isLocal ? 'local' : 'external']?.end()
            sockets[isLocal ? 'local' : 'external'] = null
        })

        deviceSocket.on('error', (err) => {
            log.error('SDB device socket error:', err.message)
            clientSocket.end()
        })

        deviceSocket.on('close', (hadError) => {
            log.error('SDB device socket closed %s', hadError ? '[ ERROR ]' : '')
            clientSocket.end()
        })
    })

    return {
        server,
        get client() {
            return client
        }
    }
}

export default syrup.serial()
    .dependency(urlformat)
    .dependency(connector)
    .define((options, urlformat, connector) => {
        const log = logger.createLogger('tizen-device:plugins:sdb:connect')
        console.log('PROXY CONF:', options.host, options.port, options.connectPort)

        const proxy = tcpProxy(options.host, options.port, log)
        proxy.server
            .on('error', (err) => {
                log.error('SDB Proxy error: %s', err)
                lifecycle.fatal('SDB Proxy error: ' + err)
            })
            .listen(options.connectPort)

        lifecycle.observe(() => promisify(proxy.server?.close)().catch())

        const plugin = {
            url: urlformat(options.connectUrlPattern, options.connectPort),
            start: () => plugin.url,

            /**
             * Tizen does not support connecting multiple SDB clients,
             * so the local client also accesses the device through a proxy.
             * Therefore, when stopping, we do not kill the server,
             * but only close the external connection.
             * */
            stop: () => proxy.externalClient?.end(),
        }

        return () => connector.init({
            serial: options.serial,
            deviceType: DEVICE_TYPE.TIZEN,
            handlers: plugin
        })
    })
