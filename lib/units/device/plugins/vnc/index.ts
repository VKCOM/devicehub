import util from 'util'
import os from 'os'
import syrup from '@devicefarmer/stf-syrup'
import {v4 as uuidv4} from 'uuid'
import jpeg from '@julusian/jpeg-turbo'
import webp from '@cwasm/webp'
import logger from '../../../../util/logger.js'
import lifecycle from '../../../../util/lifecycle.js'
import VncServer from './util/server.js'
import VncConnection from './util/connection.js'
import PointerTranslator from './util/pointertranslator.js'
import router from '../../../base-device/support/router.js'
import push from '../../../base-device/support/push.js'
import stream from '../screen/stream.js'
import touch from '../touch/index.js'
import group from '../group.js'
import solo from '../solo.js'

interface VNCConnectionState {
    lastFrame: Buffer | null
    lastFrameTime: number | null
    lastSentFrame: Buffer | null
    frameWidth: number
    frameHeight: number
    lastSentTimestamp: number
    sentFrameWidth: number
    sentFrameHeight: number
    updateRequests: number
    lastRequestIncremental: boolean
    pendingResponse: boolean
    frameConfig: {
        format: number
    }
    // Frame cache to avoid re-decoding identical frames
    cachedRawFrame: Buffer | null
    cachedDecodedFrame: {width: number, height: number, data: Buffer} | null
    // Frame type detection (cached after first frame)
    frameType: 'jpeg' | 'webp' | null
    // FPS tracking
    framesSent: number
    framesDecoded: number
    framesCached: number
    framesThrottled: number
    framesSkipped: number
    lastStatsTime: number
}

export default syrup.serial()
    .dependency(router)
    .dependency(push)
    .dependency(stream)
    .dependency(touch)
    .dependency(group)
    .dependency(solo)
    .define((options, router, push, screenStream, touch, group) => {
        const log = logger.createLogger('device:plugins:vnc')

        const MAX_FPS = 60  // Maximum fps for changing content
        const STATIC_FPS = 2 // Fps for static content
        const MAX_FRAME_INTERVAL = 1000 / MAX_FPS
        const STATIC_FRAME_INTERVAL = 1000 / STATIC_FPS

        // const vncAuthHandler = (data: any) => new Promise<void>((resolve, reject) => {
        //     log.info('VNC authentication attempt using "%s"', data.response.toString('hex'))
        //     const cleanup = () => {
        //         group.removeListener('join', joinListener)
        //         group.removeListener('autojoin', autojoinListener)
        //         router.removeListener(VncAuthResponsesUpdatedMessage, notify)
        //     }
        //
        //     const notify = async() => {
        //         try {
        //             const currentGroup = await group.get()
        //             push.send([
        //                 solo.channel,
        //                 wireutil.pack(JoinGroupByVncAuthResponseMessage, {
        //                     serial: options.serial,
        //                     response: data.response.toString('hex'),
        //                     currentGroup: currentGroup?.group
        //                 })
        //             ])
        //         } catch (e) {
        //             push.send([
        //                 solo.channel,
        //                 wireutil.pack(JoinGroupByVncAuthResponseMessage, {
        //                     serial: options.serial,
        //                     response: data.response.toString('hex')
        //                 })
        //             ])
        //         }
        //     }
        //
        //     const joinListener = (newGroup: any, identifier: any) => {
        //         if (!data.response.equals(Buffer.from(identifier || '', 'hex'))) {
        //             cleanup()
        //             reject(new Error('Someone else took the device'))
        //         }
        //     }
        //
        //     const autojoinListener = (identifier: any, joined: any) => {
        //         if (data.response.equals(Buffer.from(identifier, 'hex'))) {
        //             cleanup()
        //             if (joined) {
        //                 resolve()
        //             }
        //             else {
        //                 reject(new Error('Device is already in use'))
        //             }
        //         }
        //     }
        //
        //     group.on('join', joinListener)
        //     group.on('autojoin', autojoinListener)
        //     router.on(VncAuthResponsesUpdatedMessage, notify)
        //     notify()
        // })

        log.info('Starting VNC server on port %s', options.vncPort)

        const vnc = new VncServer({
            name: options.serial,
            width: options.vncInitialSize[0],
            height: options.vncInitialSize[1],
            // security: [{
            //     type: VncConnection.SECURITY_VNC,
            //     challenge: Buffer.alloc(16).fill(0),
            //     auth: vncAuthHandler
            // }]
        })

        vnc.on('error', (err: any) => {
            log.error('VNC error: %s', err?.message || err)
        })

        vnc.on('connection', (conn: any) => {
            log.info('New VNC connection from %s', conn.conn.remoteAddress)

            const id = util.format('vnc-%s', uuidv4())
            const connState: VNCConnectionState = {
                lastFrame: null,
                lastFrameTime: null,
                lastSentFrame: null,
                frameWidth: 0,
                frameHeight: 0,
                lastSentTimestamp: 0,
                sentFrameWidth: 0,
                sentFrameHeight: 0,
                updateRequests: 0,
                lastRequestIncremental: false,
                pendingResponse: false,
                frameConfig: {
                    format: jpeg.FORMAT_RGB
                },
                cachedRawFrame: null,
                cachedDecodedFrame: null,
                frameType: null,
                framesSent: 0,
                framesDecoded: 0,
                framesCached: 0,
                framesThrottled: 0,
                framesSkipped: 0,
                lastStatsTime: Date.now()
            }

            // Stats logging every 10 seconds
            const statsInterval = setInterval(() => {
                const now = Date.now()
                const elapsed = (now - connState.lastStatsTime) / 1000
                const fps = (connState.framesSent / elapsed).toFixed(1)
                const cacheHitRate = connState.framesSent > 0
                    ? ((connState.framesCached / connState.framesSent) * 100).toFixed(1)
                    : '0.0'

                // Always log stats, even if no activity (shows 0 fps for static screens)
                if (connState.framesSent > 0 || connState.framesThrottled > 0) {
                    log.info(`VNC Stats: ${fps} fps | sent: ${connState.framesSent}, decoded: ${connState.framesDecoded}, cached: ${cacheHitRate}%, throttled: ${connState.framesThrottled}`)
                }

                // Reset counters
                connState.framesSent = 0
                connState.framesDecoded = 0
                connState.framesCached = 0
                connState.framesThrottled = 0
                connState.framesSkipped = 0
                connState.lastStatsTime = now
            }, 10000)

            const pointerTranslator = new PointerTranslator()
                .on('touchdown', (event: any) => {
                    try {
                        // log.debug(`VNC pointer event: contact=${event.contact}, x=${event.x?.toFixed(3)}, y=${event.y?.toFixed(3)}`)
                        touch.touchDown(event)
                    } catch (err: any) {
                        log.error(`Error calling touch.touchDown(): ${err?.message} ${err?.stack}`)
                    }
                })
                .on('touchmove', (event: any) => {
                    try {
                        // log.debug(`VNC touchmove: contact=${event.contact}, x=${event.x?.toFixed(3)}, y=${event.y?.toFixed(3)}`)
                        touch.touchMove(event)
                    } catch (err: any) {
                        log.error(`Error calling touch.touchMove(): ${err?.message}`)
                    }
                })
                .on('touchup', (event: any) => {
                    try {
                        // log.debug(`VNC touchup: contact=${event.contact}`)
                        touch.touchUp(event)
                    } catch (err: any) {
                        log.error(`Error calling touch.touchUp(): ${err?.message}`)
                    }
                })
                .on('touchcommit', () => {
                    try {
                        log.debug(`VNC touchcommit`)
                        touch.touchCommit()
                    } catch (err: any) {
                        log.error(`Error calling touch.touchCommit(): ${err?.message}`)
                    }
                })
                .on('touchstart', () => {
                    try {
                        // log.debug(`VNC touchstart`)
                        touch.start()
                    } catch (err: any) {
                        log.error(`Error calling touch.touchStart(): ${err?.message}`)
                    }
                })
                .on('touchstop', () => {
                    try {
                        // log.debug(`VNC touchstop`)
                        touch.stop()
                    } catch (err: any) {
                        log.error(`Error calling touch.touchStop(): ${err?.message}`)
                    }
                })

            const maybeSendFrame = () => {
                // Must have a frame and pending update request
                if (!connState.lastFrame || !connState.updateRequests) {
                    return
                }

                const now = Date.now()
                const isFirstFrame = !connState.lastSentFrame

                // Fast frame change detection: compare size first, then first/last bytes
                // This is much faster than Buffer.equals() on large frames (20KB+)
                let frameContentChanged = !connState.lastSentFrame
                if (!frameContentChanged && connState.lastSentFrame) {
                    const current = connState.lastFrame
                    const last = connState.lastSentFrame
                    // Quick checks: size, first 4 bytes, last 4 bytes
                    frameContentChanged =
                        current.length !== last.length ||
                        current[0] !== last[0] || current[1] !== last[1] || current[2] !== last[2] || current[3] !== last[3] ||
                        current[current.length - 1] !== last[last.length - 1] ||
                        current[current.length - 2] !== last[last.length - 2]
                }

                const timeSinceLastSend = now - connState.lastSentTimestamp

                // For changing content: send as fast as possible (up to MAX_FPS)
                // For static content: rate limit to STATIC_FPS to save bandwidth/CPU
                if (frameContentChanged) {
                    // Content is changing - allow up to MAX_FPS
                    if (!isFirstFrame && timeSinceLastSend < MAX_FRAME_INTERVAL) {
                        // Too soon, but schedule immediate retry when interval passes
                        if (!connState.pendingResponse) {
                            connState.pendingResponse = true
                            connState.framesThrottled++
                            setTimeout(() => {
                                connState.pendingResponse = false
                                maybeSendFrame()
                            }, MAX_FRAME_INTERVAL - timeSinceLastSend)
                        }
                        return
                    }
                } else {
                    // Content is static - rate limit to STATIC_FPS
                    if (!isFirstFrame && connState.lastRequestIncremental && timeSinceLastSend < STATIC_FRAME_INTERVAL) {
                        // For static + incremental, use lower fps
                        if (!connState.pendingResponse) {
                            connState.pendingResponse = true
                            setTimeout(() => {
                                connState.pendingResponse = false
                                maybeSendFrame()
                            }, STATIC_FRAME_INTERVAL - timeSinceLastSend)
                        }
                        return
                    }
                }

                try {
                    const frame = connState.lastFrame!

                    let decoded: {width: number, height: number, data: Buffer}

                    // Check if we can reuse cached decoded frame
                    // Use fast comparison: same object reference means same frame
                    const canUseCache = connState.cachedRawFrame === frame

                    if (canUseCache && connState.cachedDecodedFrame) {
                        // Frame hasn't changed, reuse cached decode
                        decoded = connState.cachedDecodedFrame
                        connState.framesCached++
                    } else {
                        // New frame, need to decode
                        // Detect frame type on first frame only
                        if (!connState.frameType) {
                            const isJpeg = frame[0] === 0xFF && frame[1] === 0xD8
                            const isWebP = frame[0] === 0x52 && frame[1] === 0x49 && frame[2] === 0x46 && frame[3] === 0x46 // "RIFF"

                            if (isWebP) {
                                connState.frameType = 'webp'
                                log.info('VNC: Detected WebP frame format')
                            } else if (isJpeg) {
                                connState.frameType = 'jpeg'
                                log.info('VNC: Detected JPEG frame format')
                            } else {
                                log.error(`Unknown frame format, first 4 bytes: ${frame.slice(0, 4).toString('hex')}`)
                                return
                            }
                        }

                        // Decode based on detected frame type
                        if (connState.frameType === 'webp') {
                            const webpDecoded = webp.decode(frame)
                            decoded = {
                                width: webpDecoded.width,
                                height: webpDecoded.height,
                                data: Buffer.from(webpDecoded.data)
                            }
                            // WebP decoder returns RGBA, convert to client's expected format
                            decoded.data = convertRGBAToFormat(decoded.data, decoded.width, decoded.height, connState.frameConfig.format)
                        } else {
                            // JPEG
                            decoded = jpeg.decompressSync(frame, connState.frameConfig)
                        }

                        connState.framesDecoded++

                        // Cache the decoded frame
                        connState.cachedRawFrame = frame
                        connState.cachedDecodedFrame = decoded
                    }

                    // Build framebuffer update
                    const rectangles: any[] = [{
                        xPosition: 0,
                        yPosition: 0,
                        width: decoded.width,
                        height: decoded.height,
                        encodingType: VncConnection.ENCODING_RAW,
                        data: decoded.data
                    }]

                    // Send DESKTOPSIZE on first frame or when dimensions change
                    const isFirstFrame = connState.sentFrameWidth === 0 && connState.sentFrameHeight === 0
                    const dimensionsChanged = decoded.width !== connState.sentFrameWidth || decoded.height !== connState.sentFrameHeight

                    if (isFirstFrame || dimensionsChanged) {
                        if (isFirstFrame) {
                            log.info(`VNC: First frame, sending DESKTOPSIZE ${decoded.width}x${decoded.height}`)
                        } else {
                            log.info(`VNC: Dimensions changed from ${connState.sentFrameWidth}x${connState.sentFrameHeight} to ${decoded.width}x${decoded.height}`)
                        }
                        rectangles.push({
                            xPosition: 0,
                            yPosition: 0,
                            width: decoded.width,
                            height: decoded.height,
                            encodingType: VncConnection.ENCODING_DESKTOPSIZE
                        })
                        connState.sentFrameWidth = decoded.width
                        connState.sentFrameHeight = decoded.height
                    }

                    try {
                        conn.writeFramebufferUpdate(rectangles)
                        connState.framesSent++
                        connState.lastSentTimestamp = Date.now()
                        connState.lastSentFrame = connState.lastFrame
                        connState.updateRequests = 0
                    } catch (writeErr: any) {
                        // Client likely disconnected, ignore EPIPE errors
                        if (writeErr.code === 'EPIPE' || writeErr.code === 'ECONNRESET') {
                            log.warn('VNC client disconnected while sending frame')
                        } else {
                            throw writeErr
                        }
                    }
                } catch (err: any) {
                    log.error(`Error in maybeSendFrame: ${err?.message || 'Unknown error'}`)
                    log.error(err.stack)
                    // Don't let errors stop the broadcast
                }
            }

            // Convert RGBA (from WebP) to the format expected by VNC client
            const convertRGBAToFormat = (rgba: Buffer, width: number, height: number, targetFormat: number): Buffer => {
                const pixelCount = width * height

                // Most common case: client wants BGRX (format 3) or similar 32-bit format
                if (targetFormat === jpeg.FORMAT_BGRX) {
                    // RGBA -> BGRX
                    const result = Buffer.alloc(pixelCount * 4)
                    for (let i = 0; i < pixelCount; i++) {
                        const src = i * 4
                        const dst = i * 4
                        result[dst] = rgba[src + 2] // B
                        result[dst + 1] = rgba[src + 1] // G
                        result[dst + 2] = rgba[src] // R
                        result[dst + 3] = 0              // X (padding)
                    }
                    return result
                } else if (targetFormat === jpeg.FORMAT_RGBX || targetFormat === jpeg.FORMAT_RGB) {
                    // RGBA -> RGBX or RGB
                    const bytesPerPixel = targetFormat === jpeg.FORMAT_RGB ? 3 : 4
                    const result = Buffer.alloc(pixelCount * bytesPerPixel)
                    for (let i = 0; i < pixelCount; i++) {
                        const src = i * 4
                        const dst = i * bytesPerPixel
                        result[dst] = rgba[src] // R
                        result[dst + 1] = rgba[src + 1] // G
                        result[dst + 2] = rgba[src + 2] // B
                        if (bytesPerPixel === 4) {
                            result[dst + 3] = 0          // X
                        }
                    }
                    return result
                } else {
                    // For other formats, just strip the alpha channel for now (RGB)
                    log.warn(`Unsupported target format ${targetFormat}, converting to RGB`)
                    const result = Buffer.alloc(pixelCount * 3)
                    for (let i = 0; i < pixelCount; i++) {
                        const src = i * 4
                        const dst = i * 3
                        result[dst] = rgba[src] // R
                        result[dst + 1] = rgba[src + 1] // G
                        result[dst + 2] = rgba[src + 2] // B
                    }
                    return result
                }
            }

            const vncStartListener = (frameProducer: any) =>
                new Promise<void>((resolve) => {
                    const width = frameProducer.banner?.virtualWidth || 0
                    const height = frameProducer.banner?.virtualHeight || 0
                    log.info(`VNC: Frame producer started, updating dimensions to ${width}x${height}`)
                    connState.frameWidth = width
                    connState.frameHeight = height
                    conn.updateDimensions(width, height)
                    log.info(`VNC: Dimensions updated, pointer events will now use ${width}x${height} for normalization`)
                    resolve()
                })

            const vncFrameListener = (frame: any) =>
                new Promise<void>((resolve) => {
                    connState.lastFrame = frame
                    connState.lastFrameTime = Date.now()
                    maybeSendFrame()
                    resolve()
                })

            const groupLeaveListener = () => conn.end()

            conn.on('authenticated', () => {
                // Don't force projection update on VNC auth - use existing projection
                // This prevents unnecessary minicap restarts that can fail on certain Android versions
                // The VNC client can still request a size change later if needed
                log.info('VNC authenticated, inserting into broadcastSet with id: %s', id)

                // If frame producer is already running, update dimensions before ServerInit is sent
                if (screenStream.banner) {
                    const width = screenStream.banner.virtualWidth
                    const height = screenStream.banner.virtualHeight
                    log.info(`VNC: Setting dimensions to ${width}x${height} from running frame producer`)
                    conn.updateDimensions(width, height)
                }

                screenStream.broadcastSet?.insert(id, {
                    onStart: vncStartListener,
                    onFrame: vncFrameListener
                })
            })

            conn.on('fbupdaterequest', (request: any) => {
                connState.updateRequests += 1
                connState.lastRequestIncremental = request.incremental === 1
                maybeSendFrame()
            })

            conn.on('formatchange', (format: any) => {
                const same = os.endianness() === 'BE' === Boolean(format.bigEndianFlag)
                const formatOrder = (format.redShift > format.blueShift) === same

                let selectedFormat
                switch (format.bitsPerPixel) {
                    case 8:
                        selectedFormat = jpeg.FORMAT_GRAY
                        connState.frameConfig = {format: selectedFormat}
                        break
                    case 24:
                        selectedFormat = formatOrder ? jpeg.FORMAT_BGR : jpeg.FORMAT_RGB
                        connState.frameConfig = {format: selectedFormat}
                        break
                    case 32:
                        selectedFormat = formatOrder
                                ? format.blueShift === 0 ? jpeg.FORMAT_BGRX : jpeg.FORMAT_XBGR
                                : format.redShift === 0 ? jpeg.FORMAT_RGBX : jpeg.FORMAT_XRGB
                        connState.frameConfig = {format: selectedFormat}
                        break
                    default:
                        log.warn(`Unsupported bitsPerPixel: ${format.bitsPerPixel}, using RGB`)
                        selectedFormat = jpeg.FORMAT_RGB
                        connState.frameConfig = {format: selectedFormat}
                }
                log.info(`VNC pixel format set: ${format.bitsPerPixel}bpp, format=${selectedFormat}`)

                // Clear cache when format changes since we need to re-convert
                connState.cachedRawFrame = null
                connState.cachedDecodedFrame = null
            })

            conn.on('pointer', (event: any) => {
                // log.info(`VNC pointer event: button=${event.buttonMask}, x=${event.xPosition.toFixed(3)}, y=${event.yPosition.toFixed(3)}`)
                pointerTranslator.push(event)
            })

            conn.on('close', () => {
                log.info('VNC connection closed for device %s', options.serial)
                clearInterval(statsInterval)
                screenStream.broadcastSet?.remove(id)
                group.removeListener('leave', groupLeaveListener)
            })

            conn.on('error', (err: Error) => {
                log.warn('VNC connection error for device %s: %s', options.serial, err.message)
                clearInterval(statsInterval)
                // Clean up will happen in 'close' event
            })

            conn.on('userActivity', () => {
                group.keepalive()
            })

            group.on('leave', groupLeaveListener)
            clearInterval(statsInterval)
        })

        lifecycle.observe(() => {
            vnc.close()
        })

        return {
            start: () => vnc.listen(options.vncPort),
            stop: () => vnc.close()
        }
    })
