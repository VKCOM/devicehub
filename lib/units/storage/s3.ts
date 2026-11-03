import http from 'http'
import util from 'util'
import path from 'path'
import fs from 'fs'
import express from 'express'
import validator from 'express-validator'
import bodyParser from 'body-parser'
import { v4 as uuidv4 } from 'uuid'
import { fromIni } from '@aws-sdk/credential-providers'
import { S3 } from '@aws-sdk/client-s3'
import logger from '../../util/logger.js'
import rateLimitConfig from '../ratelimit/index.js'
import { accessTokenAuth } from '../api/helpers/securityHandlers.js'
import db from '../../db/index.js'

// @ts-ignore
import formidable from 'formidable'

interface S3Options {
    profile: string
    endpoint?: string
    bucket: string
    maxFileSize: number
    port: number
    secret: string
}

interface UploadedFile {
    field: string
    id: string
    name: string
    temppath: string
}

interface ResourceResponse {
    date: Date
    plugin: string
    id: string
    name: string
    href: string
}

export const createApp = (options: S3Options, s3: S3) => {
    const log = logger.createLogger('storage:s3')
    const app = express()

    app.set('strict routing', true)
    app.set('case sensitive routing', true)
    app.set('trust proxy', true)
    app.use(rateLimitConfig)

    // Same check as storage-temp: every file belongs to a logged in user
    app.use(async (req: any, res, next) => {
        req.options = {
            secret: options.secret
        }
        try {
            await accessTokenAuth(req)
            next()
        } catch (err: any) {
            res.status(err.status || 500).json({ message: err.message })
        }
    })

    app.use(bodyParser.json())
    app.use(validator())

    const putObject = async(plugin: string, file: any): Promise<string> => {
        const id = uuidv4()
        try {
            await s3.putObject({
                Key: id,
                Body: fs.createReadStream(file.path),
                Bucket: options.bucket,
                Metadata: {
                    plugin: plugin,
                    name: file.name
                }
            })

            log.info('Stored %s as %s/%s', file.name, options.bucket, id)
            return id
        } catch (err: any) {
            log.error('Unable to store %s as %s/%s: %s', file.temppath, options.bucket, id, err.stack)
            throw err
        }
    }

    const getHref = (plugin: string, id: string, name: string) =>
        util.format('/s/%s/%s%s', plugin, id, name ? '/' + path.basename(name) : '')

    app.post('/s/upload/:plugin', async (req, res) => {
        try {
            const form = new formidable.IncomingForm({
                maxFileSize: options.maxFileSize
            } as any)

            const plugin = req.params.plugin
            const parseForm = util.promisify(form.parse.bind(form))
            const [fields, files] = (await parseForm(req)) as any

            const uploadRequests = Object.keys(files).map(async (field) => {
                const file = files[field]
                const id = await putObject(plugin, file)
                log.info('Store screenshot: %s %s', file.path, file.name)
                return {
                    field: field,
                    id: id,
                    name: file.name,
                    temppath: file.path
                }
            })

            const storedFiles: UploadedFile[] = await Promise.all(uploadRequests)

            const mapped: Record<string, ResourceResponse> = Object.create(null)
            storedFiles.forEach((file) => {
                mapped[file.field] = {
                    date: new Date(),
                    plugin: plugin,
                    id: file.id,
                    name: file.name,
                    href: getHref(plugin, file.id, file.name)
                }
            })

            res.status(201).json({
                success: true,
                resources: mapped
            })

            // Cleanup temp files
            const unlinkAsync = util.promisify(fs.unlink)
            await Promise.all(
                storedFiles.map(async (file) => {
                    try {
                        await unlinkAsync(file.temppath)
                    } catch (err: any) {
                        log.warn('Unable to clean up %s: %s', file.temppath, err.stack)
                    }
                })
            )
        } catch (err: any) {
            log.error('Error storing resource %s', err.stack)
            res.status(500).json({
                success: false,
                error: 'ServerError'
            })
        }
    })

    app.get('/s/blob/:id/:name', async (req, res) => {
        try {
            const params = {
                Key: req.params.id,
                Bucket: options.bucket
            }

            const data = await s3.getObject(params)

            res.set({
                'Content-Type': data.ContentType
            })
            res.send(data.Body)
        } catch (err: any) {
            log.error('Unable to retrieve %s: %s', req.params.id, err.stack)
            res.sendStatus(404)
        }
    })

    return app
}

export default async function (options: S3Options) {
    const log = logger.createLogger('storage:s3')
    await db.connect()

    const s3 = new S3({
        // JS SDK v3 switched credential providers from classes to functions.
        // This is the closest approximation from codemod of what your application needs.
        // Reference: https://www.npmjs.com/package/@aws-sdk/credential-providers
        credentials: fromIni({
            profile: options.profile
        }),
        endpoint: options.endpoint
    })

    const server = http.createServer(createApp(options, s3))
    server.listen(options.port)
    log.info('Listening on port %s', options.port)
}
