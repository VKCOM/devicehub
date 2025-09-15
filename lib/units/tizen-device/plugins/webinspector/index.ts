import push from '../../../base-device/support/push.js'
import router from '../../../base-device/support/router.js'
import group from '../../../base-device/plugins/group.js'
import cdp, {CDPClient} from '../cdp/index.js'
import wire from '../../../../wire/index.js'
import wireutil from '../../../../wire/util.js'
import logger from '../../../../util/logger.js'

import syrup from '@devicefarmer/stf-syrup'
import webSocketServer from 'ws'
import _ from 'lodash'
import urlformat from '../../../base-device/support/urlformat.js'
import MyReplicator from './Replicator.js'
import * as transform from './transform/index.js'

const consoleListeners = new Map()
const replicator = new MyReplicator()
replicator.addTransforms(Object.values(transform))

const inspectServer = (port: number, cdp: CDPClient, log: any) =>
    new webSocketServer.Server({port})
        .on('connection', async(ws, req) => {
            try {
                const {remoteAddress} = req.socket
                log.info('New Inspect Server connection [%s]', remoteAddress)
                const sendHTML = async(retry = true) => {
                    try {
                        ws.send(JSON.stringify({
                            htmlUpdate: await cdp.getHTML()
                        }))
                    }
                    catch (err) {
                        log.error(`Error while send html: ${retry ? '[ RETRY ]' : ''}`, err)
                        if (retry) {
                            return sendHTML(false)
                        }
                    }
                }
                sendHTML()

                ws.on('message', async(data) => {
                    const result = (
                        await cdp.client.Runtime.evaluate({
                            expression: data.toString()
                        }).catch(err => log.error('Error while evaluate user console script:', err))
                    ).result

                    const out = Object.keys(result)?.length === 1 && 'type' in result ?
                        result.type : (result?.value || result)

                    ws.send(replicator.encode({
                        method: 'log',
                        timestamp: new Date().toISOString(),
                        data: [out]
                    }), () => {})
                })

                ws.on('close', () => {
                    log.info('Inspect Server connection closed [%s]', remoteAddress)
                    consoleListeners.delete(remoteAddress)
                })

                if (!consoleListeners.has(remoteAddress)) {
                    consoleListeners.set(remoteAddress, (arg: any, method: string, timestamp: number) => {
                        if (arg?.value === '--mut--') {
                            sendHTML()
                            return
                        }

                        ws.send(replicator.encode({
                            method, timestamp,
                            data: [arg],
                        }))
                    })
                }
            }
            catch (err: any) {
                log.error('Updates server :', err)
                ws.send(JSON.stringify({error: err?.message || err}))
            }
        })

export default syrup.serial()
    .dependency(push)
    .dependency(router)
    .dependency(cdp)
    .dependency(group)
    .dependency(urlformat)
    .define((options, push, router, cdp, group, urlformat) => {
        const log = logger.createLogger('tizen-device:plugins:webinspector')
        const reply = wireutil.reply(options.serial)
        let frameId: string | null = null

        const success = (channel: string, body: any) =>
            push.send([channel, reply.okay('success', body)])
        const fail = (channel: string, err: any) =>
            push.send([channel, reply.fail('fail', err?.message || err)])

        const getAssetsList = async() => {
            const result = await cdp.getAssetsList()
            if (!frameId) {
                frameId = result.frameId
            }
            return result
        }

        const getAsset = async(url: string) => {
            if (!frameId) {
                await getAssetsList()
            }

            return await cdp.getAsset(frameId, url)
        }

        const wsUrl = urlformat(options.updWsUrlPattern, options.publicPort)

        const handlers = {

            // TODO: Create download endpoint
            [wire.GetAppAsset .$code]: (channel: string, message: any) => getAsset(message.url).then(asset =>
                success(channel, asset)
            ).catch(err =>
                fail(channel, err)
            ),

            [wire.GetAppAssetsList .$code]: (channel: string) => getAssetsList().then(list =>
                success(channel, list)
            ).catch(err =>
                fail(channel, err)
            ),

            [wire.GetAppHTML .$code]: (channel: string) => cdp.getHTML().then(content =>
                success(channel, {content, base64Encoded: false})
            ).catch(err =>
                fail(channel, err)
            ),

            [wire.GetAppInspectServerUrl .$code]: (channel: string) =>
                success(channel, wsUrl)
        }
        let inspServer: webSocketServer.Server | null = null
        const plugin = {
            host: '',
            port: 0,
            start: async(port: number, host = options.host) => {
                plugin.host = host
                plugin.port = port

                await plugin.reconnect()

                if (!inspServer) {
                    inspServer = inspectServer(options.publicPort, cdp, log)
                }

                Object.entries(handlers)
                    .map(([event, handler]) => router.on(event, handler))
            },

            stop: async() => {
                Object.entries(handlers)
                    .map(([event, handler]) => router.removeListener(event, handler))

                frameId = null
                await new Promise(r => {
                    inspServer?.close(() => r)
                    setTimeout(r, 1000)
                })
                inspServer = null
                await cdp.close()
            },

            reconnect: async() => {
                await cdp.close()
                await cdp.connect(plugin.host, plugin.port)

                const {Runtime} = cdp.client
                Runtime.on('consoleAPICalled', _.debounce((event) => {
                    log.info('Send console output to listeners [ %s ]', event.type)
                    event.args.forEach((arg: any) =>
                        consoleListeners.forEach(fn =>
                            fn(arg, event.type, event.timestamp)
                        )
                    )
                }, 200))

                // Observe any mutation and send a specific log message
                Runtime.evaluate({
                    expression:
                        `new MutationObserver((mutations) => {
                            console.log('--mut--');
                        }).observe(document.body, { attributes: true, childList: true, subtree: true });`,
                })
            },

            get isConnected() {
                return !!inspServer
            }
        }

        group.on('leave', () => plugin.stop())
        return plugin
    })
