import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
import type {Client} from '@u4/adbkit'
import split from 'split'
import EventEmitter from 'events'
import {Parser, Adb} from '@u4/adbkit'
import logger from '../../../../util/logger.js'
import lifecycle from '../../../../util/lifecycle.js'
import SeqQueue from '../../../../wire/seqqueue.js'
import StateQueue from '../../../../util/statequeue.js'
import RiskyStream from '../../../../util/riskystream.js'
import FailCounter from '../../../../util/failcounter.js'
import adb from '../../support/adb.js'
import router from '../../../base-device/support/router.js'
import minitouch from '../../resources/minitouch.js'
import flags from '../util/flags.js'
import {
    GestureStartMessage,
    GestureStopMessage,
    TouchCommitMessage,
    TouchDownMessage,
    TouchMoveMessage,
    TouchResetMessage,
    TouchUpMessage
} from '../../../../wire/wire.js'

interface TouchPoint {
    contact: number
    x: number
    y: number
    pressure?: number
}

interface TouchOrigin {
    x: (point: TouchPoint) => number
    y: (point: TouchPoint) => number
}

interface TouchConfig {
    origin: TouchOrigin
}

interface Banner {
    pid: number
    version: number
    maxContacts: number
    maxX: number
    maxY: number
    maxPressure: number
}

interface MinitouchService {
    bin: string
    run: (cmd?: string) => Promise<NodeJS.ReadableStream>
}

interface TouchOptions {
    serial: string
}

const log = logger.createLogger('device:plugins:touch')

const STATE_STOPPED = 1
const STATE_STARTING = 2
const STATE_STARTED = 3
const STATE_STOPPING = 4

type TouchState = typeof STATE_STOPPED | typeof STATE_STARTING | typeof STATE_STARTED | typeof STATE_STOPPING

class TouchConsumer extends EventEmitter {
    private actionQueue: any[] = []
    private runningState: TouchState = STATE_STOPPED
    private desiredState: StateQueue
    private output: RiskyStream | null = null
    private socket: RiskyStream | null = null
    private banner: Banner | null = null
    private touchConfig: TouchConfig
    private starter: Promise<any> = Promise.resolve(true)
    private failCounter: FailCounter
    private failed: boolean = false
    private readableListener: () => void
    private writeQueue: Array<() => void> = []
    private options: TouchOptions
    private adb: Client
    private minitouch: MinitouchService
    private ensureStateLock: boolean = false
    private splitStream: any = null

    constructor(config: TouchConfig, options: TouchOptions, adb: Client, minitouch: MinitouchService) {
        super()
        this.options = options
        this.adb = adb
        this.minitouch = minitouch
        this.desiredState = new StateQueue()
        this.touchConfig = config
        this.failCounter = new FailCounter(3, 10000)
        this.failCounter.on('exceedLimit', this._failLimitExceeded.bind(this))
        this.readableListener = this._readableListener.bind(this)
    }

    private _queueWrite(writer: () => void): void {
        switch (this.runningState) {
            case STATE_STARTED:
                writer.call(this)
                break
            default:
                this.writeQueue.push(writer)
                break
        }
    }

    touchDown(point: TouchPoint): void {
        this._queueWrite(() => {
            const x = Math.ceil(this.touchConfig.origin.x(point) * this.banner!.maxX)
            const y = Math.ceil(this.touchConfig.origin.y(point) * this.banner!.maxY)
            const p = Math.max(1, Math.ceil((point.pressure || 0.5) * this.banner!.maxPressure))
            return this._write(`d ${point.contact} ${x} ${y} ${p}\n`)
        })
    }

    touchMove(point: TouchPoint): void {
        this._queueWrite(() => {
            const x = Math.ceil(this.touchConfig.origin.x(point) * this.banner!.maxX)
            const y = Math.ceil(this.touchConfig.origin.y(point) * this.banner!.maxY)
            const p = Math.max(1, Math.ceil((point.pressure || 0.5) * this.banner!.maxPressure))
            return this._write(`m ${point.contact} ${x} ${y} ${p}\n`)
        })
    }

    touchUp(point: TouchPoint): void {
        this._queueWrite(() => {
            return this._write(`u ${point.contact}\n`)
        })
    }

    touchCommit(): void {
        this._queueWrite(() => {
            return this._write('c\n')
        })
    }

    touchReset(): void {
        this._queueWrite(() => {
            return this._write('r\n')
        })
    }

    tap(point: TouchPoint): void {
        this.touchDown(point)
        this.touchCommit()
        this.touchUp(point)
        this.touchCommit()
    }

    private async startState(): Promise<void> {
        if (this.desiredState.next() !== STATE_STARTED) {
            this.ensureStateLock = false
            setImmediate(() => this._ensureState())
            return
        }

        this.runningState = STATE_STARTING
        try {
            const out = await this._startService()
            this.output = new RiskyStream(out)
                .on('unexpectedEnd', this._outputEnded.bind(this))

            this._readOutput(this.output.stream)

            const socket = await this._connectService()
            this.socket = new RiskyStream(socket)
                .on('unexpectedEnd', this._socketEnded.bind(this))

            const banner = await this._readBanner(this.socket.stream)
            this.banner = banner

            this._readUnexpected(this.socket.stream)
            this._processWriteQueue()

            this.runningState = STATE_STARTED
            this.emit('start')
        } catch (err: any) {
            try {
                await this._stop()
            } finally {
                if (err.name !== 'CancellationError') {
                    this.failCounter.inc()
                    this.emit('error', err)
                }
            }
        } finally {
            this.ensureStateLock = false
            this._ensureState()
        }
    }

    private async stopState(): Promise<void> {
        if (this.desiredState.next() !== STATE_STOPPED) {
            this.ensureStateLock = false
            setImmediate(() => this._ensureState())
            return
        }

        this.runningState = STATE_STOPPING
        await this._stop()
            .finally(() => {
                this.ensureStateLock = false
                this._ensureState()
            })
    }

    private async _ensureState(): Promise<void> {
        if (this.desiredState.empty()) {
            return
        }
        if (this.failed) {
            log.warn('Will not apply desired state due to too many failures')
            return
        }

        // Prevent concurrent execution
        if (this.ensureStateLock) {
            return
        }

        this.ensureStateLock = true
        try {
            switch (this.runningState) {
                case STATE_STARTING:
                case STATE_STOPPING:
                    // Just wait.
                    break
                case STATE_STOPPED:
                    await this.startState()
                    break
                case STATE_STARTED:
                    await this.stopState()
                    break
            }
        } catch (err) {
            this.ensureStateLock = false
            throw err
        }
    }

    start(): void {
        this.desiredState.push(STATE_STARTED)
        this._ensureState()
    }

    stop(): void {
        this.desiredState.push(STATE_STOPPED)
        this._ensureState()
    }

    async restart(): Promise<void> {
        switch (this.runningState) {
            case STATE_STARTED:
            case STATE_STARTING:
                await this._stop()
                this.desiredState.push(STATE_STOPPED)
                this.desiredState.push(STATE_STARTED)
                this._ensureState()
                break
        }
    }

    private _configChanged(): void {
        this.restart()
    }

    private _socketEnded(): void {
        this.failCounter.inc()
        this.restart()
    }

    private _outputEnded(): void {
        this.failCounter.inc()
        this.restart()
    }

    private _failLimitExceeded(limit: number, time: number): void {
        this._stop()
        this.failed = true
        this.emit('error', new Error(util.format('Failed more than %d times in %dms', limit, time)))
    }

    private async _startService(): Promise<NodeJS.ReadableStream> {
        return await this.minitouch.run()
    }

    private _readOutput(out: NodeJS.ReadableStream): void {
        // Clean up previous split stream if exists
        if (this.splitStream) {
            this.splitStream.removeAllListeners('data')
            this.splitStream.destroy()
        }

        this.splitStream = out.pipe(split()).on('data', (line: any) => {
            const trimmed = line.toString().trim()
            if (trimmed === '') {
                return
            }
            if (line.includes('ERROR')) {
                log.fatal('minitouch error: "%s"', line)
                return lifecycle.fatal()
            }
            log.info('minitouch says: "%s"', line)
        })
    }

    private async _connectService(): Promise<any> {
        const tryConnect = async (times: number, delay: number): Promise<any> => {
            try {
                const out = await this.adb.getDevice(this.options.serial).openLocal('localabstract:minitouch')
                return out
            } catch (err: any) {
                if (err.message?.includes('closed') && times > 1) {
                    await new Promise(resolve => setTimeout(resolve, delay))
                    return tryConnect(times - 1, delay * 2)
                }
                throw err
            }
        }

        log.info('Connecting to minitouch service')
        // SH-03G can be very slow to start sometimes. Make sure we try long
        // enough.
        return tryConnect(7, 100)
    }

    private async _stop(): Promise<void> {
        try {
            await this._disconnectService(this.socket)
            await Promise.race([
                this._stopService(this.output),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
            ])
            this.runningState = STATE_STOPPED
            this.emit('stop')
        } catch (err) {
            // In practice we _should_ never get here due to _stopService()
            // being quite aggressive. But if we do, well... assume it
            // stopped anyway for now.
            this.runningState = STATE_STOPPED
            this.emit('error', err)
            this.emit('stop')
        } finally {
            // Clean up split stream
            if (this.splitStream) {
                this.splitStream.removeAllListeners('data')
                this.splitStream.destroy()
                this.splitStream = null
            }

            this.output = null
            this.socket = null
            this.banner = null
        }
    }

    private async _disconnectService(socket: RiskyStream | null): Promise<boolean> {
        log.info('Disconnecting from minitouch service')

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

            // Add timeout
            setTimeout(() => {
                socket.removeListener('end', endListener)
                resolve(true)
            }, 2000)
        })
    }

    private async _stopService(output: RiskyStream | null): Promise<boolean> {
        log.info('Stopping minitouch service')

        if (!output || output.ended) {
            return true
        }

        const pid = this.banner ? this.banner.pid : -1

        const kill = async (signal: 'SIGTERM' | 'SIGKILL'): Promise<boolean> => {
            if (pid <= 0) {
                throw new Error('Minitouch service pid is unknown')
            }
            const signum = {
                SIGTERM: -15,
                SIGKILL: -9
            }[signal]

            log.info('Sending %s to minitouch', signal)

            await Promise.race([
                Promise.all([
                    output.waitForEnd(),
                    this.adb.getDevice(this.options.serial).shell(['kill', signum.toString(), pid.toString()])
                        .then(Adb.util.readAll)
                ]),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
            ])

            return true
        }

        const kindKill = () => kill('SIGTERM')
        const forceKill = () => kill('SIGKILL')
        const forceEnd = () => {
            log.info('Ending minitouch I/O as a last resort')
            output.end()
            return true
        }

        try {
            return await kindKill()
        } catch (err: any) {
            if (err.message === 'Timeout') {
                try {
                    return await forceKill()
                } catch {
                    return forceEnd()
                }
            }
            return forceEnd()
        }
    }

    private async _readBanner(socket: any): Promise<Banner> {
        log.info('Reading minitouch banner')

        const parser = new Parser(socket)
        const banner: Banner = {
            pid: -1,
            version: 0,
            maxContacts: 0,
            maxX: 0,
            maxY: 0,
            maxPressure: 0
        }

        const readVersion = async (): Promise<void> => {
            const chunk = await parser.readLine()
            const args = chunk.toString().split(/ /g)
            switch (args[0]) {
                case 'v':
                    banner.version = Number(args[1])
                    break
                default:
                    throw new Error(util.format('Unexpected output "%s", expecting version line', chunk))
            }
        }

        const readLimits = async (): Promise<void> => {
            const chunk = await parser.readLine()
            const args = chunk.toString().split(/ /g)
            switch (args[0]) {
                case '^':
                    banner.maxContacts = Number(args[1])
                    banner.maxX = Number(args[2])
                    banner.maxY = Number(args[3])
                    banner.maxPressure = Number(args[4])
                    break
                default:
                    throw new Error(util.format('Unknown output "%s", expecting limits line', chunk))
            }
        }

        const readPid = async (): Promise<void> => {
            const chunk = await parser.readLine()
            const args = chunk.toString().split(/ /g)
            switch (args[0]) {
                case '$':
                    banner.pid = Number(args[1])
                    break
                default:
                    throw new Error(util.format('Unexpected output "%s", expecting pid line', chunk))
            }
        }

        await readVersion()
        await readLimits()
        await readPid()
        return banner
    }

    private _readUnexpected(socket: any): void {
        socket.on('readable', this.readableListener)
        // We may already have data pending.
        this.readableListener()
    }

    private _readableListener(): void {
        let chunk
        while ((chunk = this.socket?.stream.read())) {
            log.warn('Unexpected output from minitouch socket: %s', chunk)
        }
    }

    private _processWriteQueue(): void {
        while (this.writeQueue.length > 0) {
            const writer = this.writeQueue.shift()
            writer?.call(this)
        }
    }

    private _write(chunk: string): void {
        if (!this.socket?.stream) {
            return
        }

        // Handle backpressure
        const canWrite = this.socket.stream.write(chunk)
        if (!canWrite) {
            log.warn('Socket buffer is full, experiencing backpressure')
        }
    }

    destroy(): void {
        // Clean up all resources
        if (this.splitStream) {
            this.splitStream.removeAllListeners('data')
            this.splitStream.destroy()
            this.splitStream = null
        }

        if (this.socket) {
            this.socket.stream.removeListener('readable', this.readableListener)
            this.socket.removeAllListeners()
        }

        if (this.output) {
            this.output.removeAllListeners()
        }

        this.failCounter.removeAllListeners()
        this.removeAllListeners()
        this.writeQueue = []
    }
}

export default syrup.serial()
    .dependency(adb)
    .dependency(router)
    .dependency(minitouch)
    .dependency(flags)
    .define(async (options: TouchOptions, adb: Client, router: any, minitouch: MinitouchService, flags: any) => {
        const startConsumer = async (): Promise<TouchConsumer> => {
            const origin = flags.get('forceTouchOrigin', 'top left')
            log.info('Touch origin is %s', origin)

            const touchOrigins: Record<string, TouchOrigin> = {
                'top left': {
                    x: (point: TouchPoint) => point.x,
                    y: (point: TouchPoint) => point.y
                },
                // So far the only device we've seen exhibiting this behavior
                // is Yoga Tablet 8.
                'bottom left': {
                    x: (point: TouchPoint) => 1 - point.y,
                    y: (point: TouchPoint) => point.x
                }
            }

            const touchConsumer = new TouchConsumer({
                // Usually the touch origin is the same as the display's origin,
                // but sometimes it might not be.
                origin: touchOrigins[origin]
            }, options, adb, minitouch)

            // Use Promise.race with once() for cleaner event handling
            touchConsumer.start()

            return Promise.race([
                new Promise<TouchConsumer>((resolve) => {
                    touchConsumer.once('start', () => resolve(touchConsumer))
                }),
                new Promise<TouchConsumer>((_, reject) => {
                    touchConsumer.once('error', reject)
                })
            ])
        }

        const touchConsumer = await startConsumer()

        // TODO: refactoring SeqQueue
        // const queue = new SeqQueue(100, 4)

        touchConsumer.on('error', (err: Error) => {
            log.fatal('Touch consumer had an error %s: %s', err?.message, err?.stack)
            lifecycle.fatal()
        })

        router
            .on(GestureStartMessage, (channel: any, message: any) => {
                touchConsumer.start()
            })
            .on(GestureStopMessage, (channel: any, message: any) => {
                touchConsumer.stop()
            })
            .on(TouchDownMessage, (channel: any, message: any) => {
                touchConsumer.touchDown(message)
            })
            .on(TouchMoveMessage, (channel: any, message: any) => {
                touchConsumer.touchMove(message)
            })
            .on(TouchUpMessage, (channel: any, message: any) => {
                touchConsumer.touchUp(message)
            })
            .on(TouchCommitMessage, (channel: any, message: any) => {
                touchConsumer.touchCommit()
            })
            .on(TouchResetMessage, (channel: any, message: any) => {
                touchConsumer.touchReset()
            })

        return touchConsumer
    })

