import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
import WebSocket from 'ws'
import {v4 as uuidv4} from 'uuid'
import EventEmitter from 'eventemitter3'
import split from 'split'
import {Adb} from '@u4/adbkit'
import {Readable} from 'stream'
import logger from '../../../../util/logger.js'
import lifecycle from '../../../../util/lifecycle.js'
import * as bannerutil from './util/banner.js'
import {Banner} from './util/banner.js'
import FrameParser from './util/frameparser.js'
import FrameConfig from './util/frameconfig.js'
import BroadcastSet from './util/broadcastset.js'
import StateQueue from '../../../../util/statequeue.js'
import RiskyStream from '../../../../util/riskystream.js'
import FailCounter from '../../../../util/failcounter.js'
import adb from '../../support/adb.js'
import router from '../../../base-device/support/router.js'
import minicap from '../../resources/minicap.js'
import scrcpy from '../../resources/scrcpy.js'
import display from '../util/display.js'
import options from './options.js'
import group from '../group.js'
import * as jwtutil from '../../../../util/jwtutil.js'
import {NoGroupError} from '../../../../util/grouputil.js'
import {ChangeQualityMessage} from '../../../../wire/wire.js'

// Utility functions to replace Bluebird
class TimeoutError extends Error {
    constructor(message: string = 'Operation timed out') {
        super(message)
        this.name = 'TimeoutError'
    }
}

class CancellationError extends Error {
    constructor(message: string = 'Promise was cancelled') {
        super(message)
        this.name = 'CancellationError'
    }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new TimeoutError(`Operation timed out after ${ms}ms`))
        }, ms)

        promise
            .then((value) => {
                clearTimeout(timer)
                resolve(value)
            })
            .catch((error) => {
                clearTimeout(timer)
                reject(error)
            })
    })
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

type FrameProducerState = 1 | 2 | 3 | 4

interface ScreenOptions {
    publicPort: number
    screenPingInterval?: number
}

interface DeviceOptions {
    serial: string
    screenGrabber: string
    screenFrameRate: number
    screenJpegQuality: number
    needScrcpy: boolean
    secret: string
}

interface DisplayProperties {
    width: number
    height: number
    rotation: number
}

export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(minicap)
    .dependency(scrcpy)
    .dependency(display)
    .dependency(options)
    .dependency(group)
    .define((options: DeviceOptions, adb: any, router: any, minicap: any, scrcpy: any, display: any, screenOptions: ScreenOptions, group: any) => {
        const log = logger.createLogger('device:plugins:screen:stream')
        log.info('ScreenGrabber option set to %s', options.screenGrabber)
        log.info('ScreenFrameRate option set to %s', options.screenFrameRate)
        const scrcpyClient = new scrcpy.Scrcpy()

        class FrameProducer extends EventEmitter {
            static readonly STATE_STOPPED: FrameProducerState = 1
            static readonly STATE_STARTING: FrameProducerState = 2
            static readonly STATE_STARTED: FrameProducerState = 3
            static readonly STATE_STOPPING: FrameProducerState = 4

            public actionQueue: any[]
            public runningState: FrameProducerState
            public desiredState: StateQueue
            public output: RiskyStream | null
            public socket: RiskyStream | null
            public pid: number
            public banner: Banner | null
            public parser: FrameParser | null
            public frameConfig: FrameConfig
            public grabber: string
            public readable: boolean
            public needsReadable: boolean
            public failCounter: FailCounter
            public failed: boolean
            public broadcastSet?: BroadcastSet
            private readableListener: () => void

            constructor(config: FrameConfig, grabber: string) {
                super()
                this.actionQueue = []
                this.runningState = FrameProducer.STATE_STOPPED
                this.desiredState = new StateQueue()
                this.output = null
                this.socket = null
                this.pid = -1
                this.banner = null
                this.parser = null
                this.frameConfig = config
                this.grabber = options.screenGrabber
                this.readable = false
                this.needsReadable = false
                this.failCounter = new FailCounter(3, 10000)
                this.failCounter.on('exceedLimit', this._failLimitExceeded.bind(this))
                this.failed = false
                this.readableListener = this._readableListener.bind(this)
            }

            private async _ensureState(): Promise<void> {
                if (this.desiredState.empty()) {
                    return
                }

                if (this.failed) {
                    log.warn('Will not apply desired state due to too many failures')
                    return
                }

                switch (this.runningState) {
                case FrameProducer.STATE_STARTING:
                case FrameProducer.STATE_STOPPING:
                    // Just wait.
                    break
                case FrameProducer.STATE_STOPPED:
                    if (this.desiredState.next() === FrameProducer.STATE_STARTED) {
                        this.runningState = FrameProducer.STATE_STARTING
                        if (options.needScrcpy) {
                            try {
                                await scrcpyClient.start()
                                this.runningState = FrameProducer.STATE_STARTED
                                this.emit('start')
                            } catch (err: any) {
                                log.error('Scrcpy start failed: %s', err?.message || err)
                            }
                        }
                        else {
                            try {
                                const out = await this._startService()
                                this.output = new RiskyStream(out)
                                    .on('unexpectedEnd', this._outputEnded.bind(this))
                                await this._readOutput(this.output.stream)
                                await this._waitForPid()
                                const socket = await this._connectService()
                                this.parser = new FrameParser()
                                this.socket = new RiskyStream(socket)
                                    .on('unexpectedEnd', this._socketEnded.bind(this))
                                const banner = await this._readBanner(this.socket.stream)
                                this.banner = banner
                                await this._readFrames(this.socket.stream)
                                this.runningState = FrameProducer.STATE_STARTED
                                this.emit('start')
                            } catch (err) {
                                if (err instanceof CancellationError) {
                                    await this._stop()
                                } else {
                                    await this._stop()
                                    this.failCounter.inc()
                                    this.grabber = 'minicap-apk'
                                }
                            } finally {
                                await this._ensureState()
                            }
                        }
                    }
                    else {
                        setImmediate(() => this._ensureState())
                    }
                    break
                case FrameProducer.STATE_STARTED:
                    if (this.desiredState.next() === FrameProducer.STATE_STOPPED) {
                        this.runningState = FrameProducer.STATE_STOPPING
                        try {
                            await this._stop()
                        } finally {
                            await this._ensureState()
                        }
                    }
                    else {
                        setImmediate(() => this._ensureState())
                    }
                    break
                }
            }

            public start(): void {
                log.info('Requesting frame producer to start')
                this.desiredState.push(FrameProducer.STATE_STARTED)
                this._ensureState()
            }

            public stop(): void {
                log.info('Requesting frame producer to stop')
                this.desiredState.push(FrameProducer.STATE_STOPPED)
                this._ensureState()
            }

            public restart(): void {
                switch (this.runningState) {
                case FrameProducer.STATE_STARTED:
                case FrameProducer.STATE_STARTING:
                    this.desiredState.push(FrameProducer.STATE_STOPPED)
                    this.desiredState.push(FrameProducer.STATE_STARTED)
                    this._ensureState()
                    break
                }
            }

            public updateRotation(rotation: number): void {
                if (this.frameConfig.rotation === rotation) {
                    log.info('Keeping %s as current frame producer rotation', rotation)
                    return
                }
                log.info('Setting frame producer rotation to %s', rotation)
                this.frameConfig.rotation = rotation
                this._configChanged()
            }

            public changeQuality(newQuality: number): void {
                log.info('Setting frame producer quality to %s', newQuality)
                this.frameConfig.quality = newQuality
                this._configChanged()
            }

            public updateProjection(width: number, height: number): void {
                if (this.frameConfig.virtualWidth === width &&
                this.frameConfig.virtualHeight === height) {
                    log.info('Keeping %sx%s as current frame producer projection', width, height)
                    return
                }
                log.info('Setting frame producer projection to %sx%s', width, height)
                this.frameConfig.virtualWidth = width
                this.frameConfig.virtualHeight = height
                this._configChanged()
            }

            public nextFrame(): Buffer | null {
                let frame: Buffer | null = null
                let chunk: Buffer | null

                if (this.parser && this.socket) {
                    while ((frame = this.parser.nextFrame()) === null) {
                        chunk = this.socket.stream.read()
                        if (chunk) {
                            this.parser.push(chunk)
                        }
                        else {
                            this.readable = false
                            break
                        }
                    }
                }
                return frame
            }

            public needFrame(): void {
                this.needsReadable = true
                this._maybeEmitReadable()
            }

            private _configChanged(): void {
                this.restart()
            }

            private _socketEnded(): void {
                log.warn('Connection to minicap ended unexpectedly')
                this.failCounter.inc()
                this.restart()
            }

            private _outputEnded(): void {
                log.warn('Shell keeping minicap running ended unexpectedly')
                this.failCounter.inc()
                this.restart()
            }

            private _failLimitExceeded(limit: number, time: number): void {
                this._stop()
                this.failed = true
                this.emit('error', new Error(util.format('Failed more than %s times in %sms', limit, time)))
            }

            private async _startService(): Promise<Readable> {
                log.info('Launching screen service %s', this.grabber)
                const args = options.screenFrameRate <= 0.0
                    ? util.format('-S -Q %s -P %s', this.frameConfig.quality, this.frameConfig.toString())
                    : util.format('-S -r %s -Q %s -P %s', options.screenFrameRate, this.frameConfig.quality, this.frameConfig.toString())

                return withTimeout(minicap.run(this.grabber, args), 10000)
            }

            private _readOutput(out: Readable): Promise<void> {
                return new Promise((resolve) => {
                    out.pipe(split()).on('data', (line: string) => {
                        const trimmed = line.toString().trim()
                        if (trimmed === '') {
                            return
                        }
                        if (/ERROR/.test(line)) {
                            log.fatal('minicap error: "%s"', line)
                            lifecycle.fatal()
                            return
                        }
                        const match = /^PID: (\d+)$/.exec(line)
                        if (match) {
                            this.pid = Number(match[1])
                            this.emit('pid', this.pid)
                        }
                        log.info('minicap says: "%s"', line)
                    })
                    // Resolve immediately as we're just setting up the pipe
                    resolve()
                })
            }

            private async _waitForPid(): Promise<number> {
                if (this.pid > 0) {
                    return this.pid
                }

                return withTimeout(
                    new Promise<number>((resolve) => {
                        const pidListener = (pid: number) => {
                            this.removeListener('pid', pidListener)
                            resolve(pid)
                        }
                        this.on('pid', pidListener)
                    }),
                    5000
                )
            }

            private async _connectService(): Promise<any> {
                const tryConnect = async (times: number, delayMs: number): Promise<any> => {
                    try {
                        const device = adb.getDevice(options.serial)
                        return await device.openLocal('localabstract:minicap')
                    } catch (err: any) {
                        if (/closed/.test(err.message) && times > 1) {
                            await delay(delayMs)
                            log.info('Retrying connect to minicap service')
                            return tryConnect(times - 1, delayMs + 100)
                        }
                        throw err
                    }
                }

                log.info('Connecting to minicap service')
                return tryConnect(10, 100)
            }

            private async _stop(): Promise<void> {
                try {
                    await withTimeout(this._disconnectService(this.socket), 2000)
                    await withTimeout(this._stopService(this.output), 10000)
                    this.runningState = FrameProducer.STATE_STOPPED
                    this.emit('stop')
                } catch (err) {
                    // In practice we _should_ never get here due to _stopService()
                    // being quite aggressive. But if we do, well... assume it
                    // stopped anyway for now.
                    this.runningState = FrameProducer.STATE_STOPPED
                    this.emit('error', err)
                    this.emit('stop')
                } finally {
                    this.output = null
                    this.socket = null
                    this.pid = -1
                    this.banner = null
                    this.parser = null
                }
            }

            private async _disconnectService(socket: RiskyStream | null): Promise<boolean> {
                log.info('Disconnecting from minicap service')
                if (!socket || socket.ended) {
                    return true
                }

                socket.stream.removeListener('readable', this.readableListener)

                return new Promise<boolean>((resolve) => {
                    const endListener = () => {
                        socket.removeListener('end', endListener)
                        resolve(true)
                    }
                    socket.on('end', endListener)
                    socket.stream.resume()
                    socket.end()
                })
            }

            private async _stopService(output: RiskyStream | null): Promise<boolean> {
                log.info('Stopping minicap service')
                if (!output || output.ended) {
                    return true
                }

                const pid = this.pid

                const kill = async (signal: 'SIGTERM' | 'SIGKILL'): Promise<any[]> => {
                    if (pid <= 0) {
                        throw new Error('Minicap service pid is unknown')
                    }
                    const signum = {
                        SIGTERM: -15,
                        SIGKILL: -9
                    }[signal]

                    log.info('Sending %s to minicap', signal)
                    const device = adb.getDevice(options.serial)
                    return withTimeout(
                        Promise.all([
                            output.waitForEnd(),
                            device.shell(['kill', signum, pid]).then(Adb.util.readAll)
                        ]),
                        2000
                    )
                }

                const kindKill = () => kill('SIGTERM')
                const forceKill = () => kill('SIGKILL')
                const forceEnd = () => {
                    log.info('Ending minicap I/O as a last resort')
                    output.end()
                    return true
                }

                try {
                    await kindKill()
                    return true
                } catch (err) {
                    if (err instanceof TimeoutError) {
                        try {
                            await forceKill()
                            return true
                        } catch {
                            return forceEnd()
                        }
                    }
                    return forceEnd()
                }
            }

            private async _readBanner(socket: Readable): Promise<Banner> {
                log.info('Reading minicap banner')
                return withTimeout(bannerutil.read(socket), 4000)
            }

            private async _readFrames(socket: Readable): Promise<void> {
                this.needsReadable = true
                socket.on('readable', this.readableListener)
                // We may already have data pending. Let the user know they should
                // at least attempt to read frames now.
                this.readableListener()
            }

            private _maybeEmitReadable(): void {
                if (this.readable && this.needsReadable) {
                    this.needsReadable = false
                    this.emit('readable')
                }
            }

            private _readableListener(): void {
                this.readable = true
                this._maybeEmitReadable()
            }
        }

        async function createServer(): Promise<WebSocket.Server> {
            log.info('Starting WebSocket server on port %s', screenOptions.publicPort)
            const wss = new WebSocket.Server({
                port: screenOptions.publicPort,
                perMessageDeflate: false
            })

            return new Promise<WebSocket.Server>((resolve, reject) => {
                const listeningListener = () => {
                    wss.removeListener('listening', listeningListener)
                    wss.removeListener('error', errorListener)
                    resolve(wss)
                }
                const errorListener = (err: Error) => {
                    wss.removeListener('listening', listeningListener)
                    wss.removeListener('error', errorListener)
                    reject(err)
                }
                wss.on('listening', listeningListener)
                wss.on('error', errorListener)
            })
        }

        return createServer()
            .then((wss) => {
                log.info('creating FrameProducer: %s', options.screenGrabber)
                const frameProducer = new FrameProducer(
                    new FrameConfig(
                        display.properties as DisplayProperties,
                        display.properties as DisplayProperties,
                        options.screenJpegQuality
                    ),
                    options.screenGrabber
                )
                const broadcastSet = frameProducer.broadcastSet = new BroadcastSet()

                broadcastSet.on('nonempty', () => {
                    frameProducer.start()
                })

                broadcastSet.on('empty', () => {
                    frameProducer.stop()
                })

                broadcastSet.on('insert', (id: string) => {
                    // If two clients join a session in the middle, one of them
                    // may not release the initial size because the projection
                    // doesn't necessarily change, and the producer doesn't Getting
                    // restarted. Therefore we have to call onStart() manually
                    // if the producer is already up and running.
                    switch (frameProducer.runningState) {
                    case FrameProducer.STATE_STARTED:
                        broadcastSet.get(id).onStart(frameProducer)
                        break
                    }
                })

                display.on('rotationChange', (newRotation: number) => {
                    frameProducer.updateRotation(newRotation)
                })

                router.on(ChangeQualityMessage, (_channel: any, message: any) => {
                    frameProducer.changeQuality(message.quality)
                })

                frameProducer.on('start', () => {
                    broadcastSet.keys().map((id: string) => {
                        return broadcastSet.get(id).onStart(frameProducer)
                    })
                })

                frameProducer.on('readable', function next() {
                    const frame = frameProducer.nextFrame()
                    if (frame) {
                        Promise.allSettled(
                            broadcastSet.keys().map((id: string) => {
                                return broadcastSet.get(id).onFrame(frame)
                            })
                        ).then(next)
                    }
                    else {
                        frameProducer.needFrame()
                    }
                })

                frameProducer.on('error', (err: Error) => {
                    log.fatal('Frame producer had an error: %s', err.stack)
                    lifecycle.fatal()
                })

                wss.on('connection', async (ws: WebSocket, req) => {
                    const id = uuidv4()
                    let pingTimer: NodeJS.Timeout | undefined

                    // Extract token from WebSocket subprotocols
                    const token = ws.protocol.substring('access_token.'.length)
                    const user = !!token && jwtutil.decode(token, options.secret)

                    if (!token || !user) {
                        log.warn('WebSocket connection attempt without token from %s', req.socket.remoteAddress)
                        ws.send(JSON.stringify({
                            type: 'auth_error',
                            message: 'Authentication token required'
                        }))
                        ws.close(1008, 'Authentication token required')
                        return
                    }

                    const tryCheckDeviceGroup = async(fail = false) => {
                        try {
                            await delay(200)

                            const deviceGroup = await group.get()
                            if (deviceGroup.email !== user?.email) {
                                const err = 'Device used by another user'
                                log.warn('WebSocket authentication failed for device %s: %s', options.serial, err)
                                ws.send(JSON.stringify({
                                    type: 'auth_error',
                                    message: err
                                }))
                                ws.close(1008, 'Authentication failed')
                                return
                            }

                            log.info('WebSocket authenticated for device %s', options.serial)

                            // Send success message
                            ws.send(JSON.stringify({
                                type: 'auth_success',
                                message: 'Authentication successful'
                            }))

                            // Sending a ping message every now and then makes sure that
                            // reverse proxies like nginx don't time out the connection [1].
                            //
                            // [1] http://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_read_timeout
                            pingTimer = setInterval(wsPingNotifier, 10 * 60000) // options.screenPingInterval
                        }
                        catch (err: any) {
                            if (!fail && err instanceof NoGroupError) {
                                await delay(1000)
                                return tryCheckDeviceGroup(true)
                            }

                            log.error('WebSocket authentication error for device %s: %s', options.serial, err.message)
                            ws.send(JSON.stringify({
                                type: 'auth_error',
                                message: 'Authentication error'
                            }), () => {})
                            ws.close(1008, 'Authentication error')
                        }
                    }

                    await tryCheckDeviceGroup()

                    function send(message: string | Buffer, sendOptions?: {binary?: boolean}): Promise<void> {
                        return new Promise((resolve, reject) => {
                            if (ws.readyState === WebSocket.OPEN) {
                                const onErr = (err?: Error) =>
                                    err ? reject(err) : resolve()

                                // @ts-ignore
                                ws.send(...(sendOptions ? [message, sendOptions, onErr] : [message, onErr]))
                                return
                            }

                            if (ws.readyState === WebSocket.CLOSED) {
                                log.warn('Unable to send to CLOSED client "%s"', id)
                                if (pingTimer) {
                                    clearInterval(pingTimer)
                                }
                                broadcastSet.remove(id)
                                return
                            }

                            log.warn('Unable to send to %s client "%s"', ws.readyState, id)
                        })
                    }

                    function wsStartNotifier(): Promise<void> {
                        return send(util.format('start %s', JSON.stringify(frameProducer.banner)))
                    }

                    function wsPingNotifier(): Promise<void> {
                        return send('ping')
                    }

                    function wsFrameNotifier(frame: Buffer): Promise<void> {
                        return send(frame, {
                            binary: true
                        })
                    }

                    ws.on('message', (data: WebSocket.Data) => {
                        const match = /^(on|off|(size) ([0-9]+)x([0-9]+))$/.exec(data.toString())
                        if (match) {
                            switch (match[2] || match[1]) {
                            case 'on':
                                broadcastSet.insert(id, {
                                    onStart: wsStartNotifier,
                                    onFrame: wsFrameNotifier
                                })
                                break
                            case 'off':
                                broadcastSet.remove(id)
                                // Keep pinging even when the screen is off.
                                break
                            case 'size':
                                frameProducer.updateProjection(Number(match[3]), Number(match[4]))
                                break
                            }
                        }
                    })

                    ws.on('close', () => {
                        if (pingTimer) {
                            clearInterval(pingTimer)
                        }
                        broadcastSet.remove(id)
                        log.info('WebSocket closed for device %s', options.serial)
                    })

                    if (options.needScrcpy) {
                        log.info(`Scrcpy client has gotten for device s/n ${options.serial}`)
                        scrcpyClient.on('rawData', (data: Buffer) => {
                            console.log(`Data: ${data}`)
                            send(data, {binary: true})
                        })
                    }

                    ws.on('error', (e: Error) => {
                        if (pingTimer) {
                            clearInterval(pingTimer)
                        }
                        broadcastSet.remove(id)
                        log.error('WebSocket error for device %s: %s', options.serial, e.message)
                    })
                })

                lifecycle.observe(() => {
                    wss.close()
                })

                lifecycle.observe(() => {
                    frameProducer.stop()
                })

                return frameProducer
            })
    })

