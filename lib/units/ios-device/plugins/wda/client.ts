import net from 'net'
import Promise from 'bluebird'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../../util/logger.js'
import lifecycle from '../../../../util/lifecycle.js'
import WdaClient from './WDAClient.js'

export default syrup.serial()
    .define(async(options) => {
        const log = logger.createLogger('wda:wdaClient')
        log.info('Initializing WDA connection')

        const wdaClient = new WdaClient({
            wdaHost: options.wdaHost,
            wdaPort: options.wdaPort
        })

        wdaClient.on('connected', () => {
            log.info('WDA client successfully received response')
        })

        wdaClient.on('disconnected', () => {
            lifecycle.fatal('WDA request error: unable to get response')
        })

        wdaClient.on('error', err => {
            log.error(err.message)
        })

        const socket = new net.Socket()

        // TODO: WDA MJPEG connection only on group
        //  & No fatal on error
        const connectToWdaMjpeg = (options: any) => {
            log.info('Connecting to WdaMjpeg')
            socket.connect(options.mjpegPort, options.wdaHost, () => {
                log.info(`Connected to WdaMjpeg ${options.wdaHost}:${options.mjpegPort}`)
            })
        }

        let retry = 4
        const wdaMjpegCloseEventHandler = async (hadError: boolean) => {
            log.error(`WdaMjpeg connection was closed${hadError ? ' by error' : ''}`)

            if (!--retry) {
                lifecycle.fatal('WdaMjpeg connection is lost')
            }

            await new Promise(r => setTimeout(r, 2000))
            connectToWdaMjpeg(options)
        }

        socket.on('close', wdaMjpegCloseEventHandler)
        socket.on('error', err => {
            log.error('WdaMjpeg connection error: %s', err?.message)
        })

        connectToWdaMjpeg(options)

        return wdaClient
    })
