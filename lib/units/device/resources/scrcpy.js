import {existsSync} from 'fs'
import {randomInt} from 'crypto'
import EventEmitter from 'events'
import split from 'split'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import {root} from '../../../util/pathutil.js'
import adb from '../support/adb.js'
import {SCRCPY_SERVER_PATH, SCRCPY_VERSION} from './scrcpy-release.js'
import {ScrcpyStreamParser, SCRCPY_CODEC_H264} from './util/scrcpy-stream.js'

const DEST = `/data/local/tmp/devicehub-scrcpy-server-${SCRCPY_VERSION}.jar`

// A video-only scrcpy server: input keeps going through minitouch and the agent.
// Emits 'item' with each parsed stream item and 'end' when the stream stops.
class ScrcpySession extends EventEmitter {
    constructor(adb, serial, log) {
        super()
        this.adb = adb
        this.serial = serial
        this.log = log
        this.output = null
        this.socket = null
        this.ended = false
    }

    async start({maxSize, maxFps, bitRate}) {
        const scid = randomInt(0, 0x7fffffff).toString(16).padStart(8, '0')
        const args = [
            SCRCPY_VERSION,
            `scid=${scid}`,
            'log_level=info',
            'audio=false',
            'control=false',
            'video_codec=h264',
            `max_size=${maxSize}`,
            `video_bit_rate=${bitRate}`,
            `max_fps=${maxFps}`,
            // Joining clients and clients that fell behind wait for a key frame
            'video_codec_options=i-frame-interval=2',
            'tunnel_forward=true',
            'send_device_meta=false',
            'send_dummy_byte=false',
            'cleanup=false'
        ]
        const cmd = `CLASSPATH=${DEST} app_process / com.genymobile.scrcpy.Server ${args.join(' ')}`
        this.log.info(cmd)

        this.output = await this.adb.getDevice(this.serial).shell(cmd)
        this.output.pipe(split()).on('data', line => {
            const trimmed = line.toString().trim()
            if (trimmed) {
                this.log.info('scrcpy says: "%s"', trimmed)
            }
        })
        this.output.on('end', () => this._end())

        // The server takes well under a second to listen on an idle device, but
        // several while the device is busy (cleaned up after a session)
        this.socket = await this._connect(`localabstract:scrcpy_${scid}`, 50, 200)
        const parser = new ScrcpyStreamParser()
        this.socket.on('data', chunk => {
            for (const item of parser.push(chunk)) {
                if (item.type === 'codec' && item.codec !== SCRCPY_CODEC_H264) {
                    this.log.error('Unexpected scrcpy codec 0x%s', item.codec.toString(16))
                    this.stop()
                    return
                }
                this.emit('item', item)
            }
        })
        // Waiting for 'readable' paused the stream: 'data' alone would not restart it
        this.socket.resume()
        this.socket.on('end', () => this._end())
        this.socket.on('error', err => {
            this.log.warn('scrcpy socket error: %s', err.message)
            this._end()
        })
    }

    // The server listens only once it is up: retry until it accepts
    async _connect(address, times, delay) {
        for (let attempt = 1; ; attempt++) {
            try {
                const socket = await this.adb.getDevice(this.serial).openLocal(address)
                // adb accepts the connection even before anything listens on
                // the device side; the first byte tells it is really open
                await new Promise((resolve, reject) => {
                    const onReadable = () => {
                        cleanup()
                        resolve()
                    }
                    const onEnd = () => {
                        cleanup()
                        reject(new Error('closed'))
                    }
                    const cleanup = () => {
                        socket.removeListener('readable', onReadable)
                        socket.removeListener('end', onEnd)
                    }
                    socket.once('readable', onReadable)
                    socket.once('end', onEnd)
                })
                return socket
            }
            catch (err) {
                if (this.ended || attempt >= times) {
                    throw err
                }
                await new Promise(resolve => setTimeout(resolve, delay))
            }
        }
    }

    _end() {
        if (this.ended) {
            return
        }
        this.ended = true
        this.emit('end')
    }

    // The server exits once its video socket closes
    stop() {
        this.ended = true
        this.socket?.destroy()
        this.output?.end()
    }
}

export default syrup.serial()
    .dependency(adb)
    .define(async function(options, adb) {
        const log = logger.createLogger('device:resources:scrcpy')
        const src = root(SCRCPY_SERVER_PATH)

        if (!existsSync(src)) {
            log.warn('%s is missing (run scripts/fetch-scrcpy-server.mjs): falling back to minicap', SCRCPY_SERVER_PATH)
            return {available: false}
        }

        try {
            const transfer = await adb.getDevice(options.serial).push(src, DEST, 0o644)
            // waitForEnd() also resolves when the push already finished: a small
            // file can end before an 'end' listener is attached, which hung setup
            await transfer.waitForEnd()
        }
        catch (err) {
            log.error('Unable to push the scrcpy server: %s', err?.message || err)
            return {available: false}
        }

        return {
            available: true,
            // `onItem` is attached before the stream flows: the session and
            // config packets come first and are needed to decode anything
            async start(config, onItem) {
                const session = new ScrcpySession(adb, options.serial, log)
                session.on('item', onItem)
                try {
                    await session.start(config)
                }
                catch (err) {
                    session.stop()
                    throw err
                }
                return session
            }
        }
    })
