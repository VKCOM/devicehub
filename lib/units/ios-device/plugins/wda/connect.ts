import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../../util/logger.js'
import wdaClient from './client.js'
import httpProxy from 'http-proxy'
import http from 'node:http'
import {decode} from '../../../../util/jwtutil.js'
import group from '../../../base-device/plugins/group.js'
import urlformat from '../../../base-device/support/urlformat.js'
import connector, {DEVICE_TYPE} from '../../../base-device/support/connector.js'

export default syrup.serial()
    .dependency(wdaClient)
    .dependency(urlformat)
    .dependency(connector)
    .dependency(group)
    .define((options, wdaClient, urlformat, connector, group) => {
        const log = logger.createLogger('ios-device:plugins:wda:connect')

        let proxy: any = null
        let server: http.Server | null = null
        const sockets = new Set<import('node:net').Socket>()
        const plugin = {
            url: urlformat(options.connectUrlPattern, options.connectPort),
            start: () => new Promise((resolve, reject) => {
                if (proxy) {
                    resolve(plugin.url)
                    return
                }

                proxy = httpProxy.createProxyServer({target: wdaClient.baseUrl})
                    .on('error', (err, _req, res) => {
                        log.error('WDA Proxy error: %s', err?.message)
                        if (res && 'writeHead' in res) {
                            if (!res.headersSent) res.writeHead(502)
                            res.end('WDA unavailable')
                        }
                        reject(err)
                    })
                server = http.createServer(async (req, res) => {
                    if (options.silent) {
                        try {
                            const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
                            const user = token && decode(token, options.secret)
                            const owner = await group.get()
                            if (!user || owner?.email !== user.email) throw new Error('Unauthorized')
                            group.keepalive()
                        }
                        catch { res.writeHead(403); res.end('Forbidden'); return }
                    }
                    proxy?.web(req, res)
                })
                server.on('connection', socket => {
                    sockets.add(socket)
                    socket.once('close', () => sockets.delete(socket))
                })
                server.once('error', reject)
                server.listen(options.connectPort, () => resolve(plugin.url))
            }),

            stop: async() => {
                for (const socket of sockets) socket.destroy()
                sockets.clear()
                const current = server
                server = null
                if (current) await new Promise<void>(resolve => current.close(() => resolve()))
                proxy?.close()
                proxy = null
            }
        }

        if (options.silent) group.on('leave', () => connector.stop())
        return () => connector.init({
            serial: options.serial,
            deviceType: DEVICE_TYPE.IOS,
            handlers: plugin
        })
    })
