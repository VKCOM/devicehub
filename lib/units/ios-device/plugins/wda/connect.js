import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../../util/logger.js'
import wdaClient from './client.js'
import httpProxy from 'http-proxy'
import urlformat from '../../../base-device/support/urlformat.js'
import connector, {DEVICE_TYPE} from '../../../base-device/support/connector.js'

export default syrup.serial()
    .dependency(wdaClient)
    .dependency(urlformat)
    .dependency(connector)
    .define((options, wdaClient, urlformat, connector) => {
        const log = logger.createLogger('ios-device:plugins:wda:connect')
        let proxy = null
        const plugin = {
            url: urlformat(options.connectUrlPattern, options.connectPort),
            start: () => new Promise((resolve, reject) => {
                proxy = proxy || httpProxy.createProxyServer({target: wdaClient.baseUrl})
                    .on('error', (err) => {
                        log.error('WDA Proxy error: %s', err)
                        reject(err)
                    })
                    .listen(options.connectPort)
                resolve(plugin.url)
            }),

            stop: async() => {
                if (connector.started && proxy) {
                    proxy.close()
                    proxy.end()
                    proxy = null
                }
            }
        }

        return () => connector.init({
            serial: options.serial,
            deviceType: DEVICE_TYPE.IOS,
            handlers: plugin
        })
    })
