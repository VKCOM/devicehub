import http from 'node:http'
import express from 'express'
import logger from '../../../util/logger.js'
import {ConflictError, type RemoteDeviceManager} from './manager.js'
import {parseConnectRequest, ValidationError} from './request.js'

const log = logger.createLogger('provider:api')

const basePath = '/api/v1/remote-devices'

export interface ProviderApiOptions {
    host: string
    port: number
    providerName: string
    devices: RemoteDeviceManager
}

/* HTTP front of the remote device manager */
export const createProviderApi = ({host, port, providerName, devices}: ProviderApiOptions) => {
    const app = express()
    app.use(express.json())

    app.get(basePath, (_req, res) => {
        res.json({devices: devices.list(), webhooks: devices.webhooks.subscriptions()})
    })

    app.post(basePath, (req, res) => {
        const {serial} = devices.connect(parseConnectRequest(req.body))
        res.status(202).json({provider: providerName, serial})
    })

    app.delete(`${basePath}/:host/:port`, (req, res) => {
        const serial = devices.disconnect(req.params.host, Number(req.params.port))
        if (!serial) {
            res.status(404).json({error: 'Device is not connected through the API'})
            return
        }
        res.status(202).json({provider: providerName, serial})
    })

    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        if (err instanceof ValidationError) {
            res.status(400).json({error: err.message})
            return
        }
        if (err?.type === 'entity.parse.failed') {
            res.status(400).json({error: 'Invalid JSON body'})
            return
        }
        if (err instanceof ConflictError) {
            res.status(409).json({error: err.message})
            return
        }
        log.error('Provider API error: %s', err?.stack || err)
        res.status(500).json({error: 'Internal error'})
    })

    const server = http.createServer(app)

    return {
        app,
        listen: () => new Promise<void>((resolve, reject) => {
            server.once('error', reject)
            server.listen(port, host, () => {
                server.off('error', reject)
                log.info('Provider API listening on %s:%s', host, port)
                resolve()
            })
        }),
        close: () => new Promise<void>(resolve => {
            server.close(() => resolve())
            // Idle keep-alive sockets would otherwise hold the shutdown
            server.closeAllConnections()
        })
    }
}
