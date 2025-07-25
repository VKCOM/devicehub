import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../../util/logger.js'
import urlformat from '../../../base-device/support/urlformat.js'
import connector, {DEVICE_TYPE} from '../../../base-device/support/connector.js'
import net from 'net'
import lifecycle from '../../../../util/lifecycle.js'
import {promisify} from 'node:util'
import os from 'os'

const localIp = Object.values(os.networkInterfaces())
    .flat()
    .find(iface => iface?.family === 'IPv4' && !iface?.internal)
    ?.address

const tcpProxy = (host, port, log) => {

    /**
     * Since Tizen supports only one active SDB connection, we open only one socket to it.
     * For the "tizen-device" unit to work, we need a service (local) sdb connection.
     * But since we also limit the number of external connections to 1 (to avoid unexpected problems),
     * we create a maximum of two sockets, one for the local one, the other for the external sdb client.
     *
     * @type {{device: net.Socket | null, local: net.Socket | null, external: net.Socket | null}} */
    const sockets = {
        device: null,
        local: null,
        external: null
    }

    const server = net.createServer((clientSocket) => {
        const isLocal = [localIp, '127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(clientSocket.remoteAddress)
        if (sockets[isLocal ? 'local' : 'external']) { // close if connection already exist
            return clientSocket.end()
        }

        clientSocket
            .setNoDelay(true)
            .setKeepAlive(true, 30_000)

        if (!sockets.device) {
            sockets.device = net.createConnection({host, port, allowHalfOpen: true})
                .setNoDelay(true)
                .setKeepAlive(true, 30_000)
                .on('error', (err) => {
                    log.error('SDB device socket error:', err)
                    clientSocket.end()
                })
                .on('close', (hadError) => {
                    log.error('SDB device socket closed', hadError ? '[ ERROR ]' : '')
                    clientSocket.end()
                    sockets.device = null
                })
        }

        sockets[isLocal ? 'local' : 'external'] = clientSocket


        clientSocket.pipe(sockets.device, {end: false})
        sockets.device.pipe(clientSocket, {end: false})

        log.info('New SDB connection %s', isLocal ? '[ LOCAL ]' : `[ ${clientSocket.remoteAddress} ]`)

        clientSocket
            .on('close', (hadError) => {
                log.info(
                    'SDB client socket closed',
                    isLocal ? '[ LOCAL ]' : `[ ${clientSocket.remoteAddress} ]`,
                    hadError ? '[ ERROR ]' : ''
                )
                sockets[isLocal ? 'local' : 'external'] = null
            })
            .on('error', (err) => {
                log.error('SDB client socket error:', err.message)
                clientSocket.end()
            })
    })

    return {
        server,
        sockets
    }
}

export default syrup.serial()
    .dependency(urlformat)
    .dependency(connector)
    .define((options, urlformat, connector) => {
        const log = logger.createLogger('tizen-device:plugins:sdb:connect')

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
            stop: () => proxy.sockets.external?.end(),
        }

        return () => connector.init({
            serial: options.serial,
            deviceType: DEVICE_TYPE.TIZEN,
            handlers: plugin
        })
    })
