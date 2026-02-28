import * as iosutil from '../util/iosutil.js'
import EventEmitter from 'events'

export type IOSOrientation = 'PORTRAIT' | 'LANDSCAPE' | 'UIA_DEVICE_ORIENTATION_LANDSCAPERIGHT' | 'UIA_DEVICE_ORIENTATION_PORTRAIT_UPSIDEDOWN'
export type IOSBatteryState = 'full' | 'unplugged' | 'charging'
export type IOSSDKVersion = string

export type DisplayInfo = Record<'width' | 'height' | 'scale', number>

type Enumerate<N extends number, Acc extends number[] = []> = Acc['length'] extends N
    ? Acc[number]
    : Enumerate<N, [...Acc, Acc['length']]>

type Range<F extends number, T extends number> = Exclude<Enumerate<T>, Enumerate<F>>

type BatteryLevel = Range<0, 100>
type RotationDegree = Range<0, 270>

type DeviceType = 'iPhone' | 'iPad' | 'Apple TV'

type RequestMethod = 'GET' | 'POST' | 'DELETE'
interface RequestOptions {
    method: RequestMethod
    uri: string
    body?: any
}

interface TouchParams {
    x: number
    y: number
}

export interface SwipeParams {
    fromX: number
    fromY: number
    toX: number
    toY: number
    duration?: any
}

interface DeviceSize {
    width: number
    height: number
}

interface WDAEvents {
    connected: []
    disconnected: []
    session: [IOSSDKVersion | null]
    battery: [IOSBatteryState, BatteryLevel]
    rotation: [IOSOrientation | null, RotationDegree]
    display: [DisplayInfo]
    error: [Error]
}

export default class WdaClient extends EventEmitter<WDAEvents> {
    public readonly baseUrl: string
    public orientation: IOSOrientation | null = null

    private requestTimeout: number = 10_000 // 10 sec

    private deviceSize: DeviceSize | null = null
    private deviceType: DeviceType | null = null
    private displayInfo: DisplayInfo = {
        width: 0,
        height: 0,
        scale: 0
    }

    private sessionId: string | null = null

    // Touch state machine
    private touchState: 'idle' | 'down' | 'moving' = 'idle'
    private touchBusy = false
    private touchStartPos: TouchParams = {x: 0, y: 0}
    private touchStartTime = 0
    private moveBuffer: Array<{x: number, y: number, time: number}> = []

    // Tuning constants for gesture detection
    private static readonly TAP_MAX_DURATION_MS = 500
    private static readonly TAP_MAX_DISTANCE = 0.02

    // Curvature detection: pre-squared threshold in normalized (0-1) coords
    // 0.015 = 6pt deviation on a 375pt-wide iPhone screen
    private static readonly CURVE_THRESHOLD_SQ = 0.015 * 0.015
    private static readonly MAX_CURVE_POINTS = 5

    private upperCase = false
    private isRotating = false

    private connected = false
    private ready = false

    public sdk: IOSSDKVersion | null = null

    constructor(parameters: {
        wdaHost: string,
        wdaPort: number,
        requestTimeout?: number
    }) {
        super()
        this.baseUrl = iosutil.getUri(parameters.wdaHost, parameters.wdaPort)
        this.requestTimeout = parameters.requestTimeout ?? this.requestTimeout
    }

    async connect() {
        if (!this.connected) {
            await this.healthCheck()
        }
    }

    async healthCheck() {
        await this.requestStatus()

        if (!this.connected && this.ready) {
            this.emit('connected')
        }

        this.connected = this.ready

        if (!this.connected) {
            this.emit('disconnected')
        }

        return this.ready
    }

    setDeviceType(rawType: string) {
        switch (rawType) {
            case 'apple-tv':
                this.deviceType = 'Apple TV'
                break
            case 'ipad':
                this.deviceType = 'iPad'
                break
            default:
                this.deviceType = 'iPhone'
        }
    }

    async requestStatus() {
        const statusResponse = await this.handleRequest({
            method: 'GET',
            uri: `${this.baseUrl}/status`
        })

        if (!statusResponse) {
            this.sessionId = null
            this.ready = false
            return
        }

        this.setDeviceType(statusResponse.value.device)

        this.sessionId = statusResponse.sessionId || null
        this.ready = statusResponse.value.ready
    }

    async requestSession() {
        const sessionResponse = await this.handleRequest({
            method: 'GET',
            uri: `${this.baseUrl}/session/${this.sessionId}`
        })

        this.sessionId = sessionResponse?.sessionId || null

        if (!sessionResponse) {
            return
        }

        this.sdk = sessionResponse.value.capabilities.sdkVersion
        this.setDeviceType(sessionResponse.value.capabilities.device)

        this.emit('session', this.sdk)
    }

    async setSize() {
        if (this.deviceSize !== null) {
            return
        }

        await this.requestDisplayInfo()
        const {width, height, scale} = this.displayInfo

        if (!width || !height || !scale) {
            this.emit('error', new Error('WDAClient error: displayInfo returned zero values'))
            return
        }

        // Set device size in points based on orientation, default is PORTRAIT
        // WDA screenSize returns values in points; gesture endpoints expect point coordinates
        if (
            !this.orientation || ['PORTRAIT', 'UIA_DEVICE_ORIENTATION_PORTRAIT_UPSIDEDOWN'].includes(this.orientation)
        ) {
            this.deviceSize = {height, width}
        } else if (
            ['LANDSCAPE', 'UIA_DEVICE_ORIENTATION_LANDSCAPERIGHT'].includes(this.orientation)
        ) {
            this.deviceSize = {
                height: width,
                width: height
            }
        } else if (this.deviceType === 'Apple TV') {
            this.deviceSize = {height, width}
        }
    }

    async startSession() {
        await this.requestStatus()

        const processSession = () =>
            Promise.all([
                ... (this.deviceType !== 'Apple TV' ? [
                    this.requestOrientation(),
                    this.requestBatteryInfo(),
                    this.requestDisplayInfo()
                ] : []),
                this.requestSession()
            ])

        if (this.sessionId) {
            await processSession()
            return true
        }

        const sessionResponse = await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session`,
            body: {capabilities: {}}
        })

        if (sessionResponse?.sessionId) {
            this.sessionId = sessionResponse.sessionId
            await processSession()

            return true
        }

        return false
    }

    async stopSession() {
        if (!this.sessionId) {
            return
        }

        const currentSessionId = this.sessionId
        this.sessionId = null

        await this.handleRequest({
            method: 'DELETE',
            uri: `${this.baseUrl}/session/${currentSessionId}`
        })
    }

    async requestOrientation() {
        const orientationResponse = await this.handleRequest({
            method: 'GET',
            uri: `${this.baseUrl}/session/${this.sessionId}/orientation`
        })

        this.orientation = orientationResponse?.value || null
        this.setSize()
    }

    async requestBatteryInfo() {
        const batteryInfoResponse = await this.handleRequest({
            method: 'GET',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/batteryInfo`
        })

        if (!batteryInfoResponse) {
            return
        }

        const batteryState = iosutil.batteryState(batteryInfoResponse.value.state)
        const batteryLevel = iosutil.batteryLevel(batteryInfoResponse.value.level) as BatteryLevel
        this.emit('battery', batteryState, batteryLevel)
    }

    async requestDisplayInfo() {
        if (this.displayInfo.width) return
        const displayInfoResponse = await this.handleRequest({
            method: 'GET',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/screen`
        })

        if (!displayInfoResponse) {
            return
        }

        this.displayInfo = {
            ...(displayInfoResponse?.value?.screenSize || this.displayInfo),
            scale: displayInfoResponse?.value?.scale || 0,
        }

        this.emit('display', this.displayInfo)
    }

    async typeKey(value: string) {
        if (!value) {
            return
        }

        // register keyDown and keyUp for current char
        if (this.upperCase) {
            value = value.toUpperCase()
        }

        if (this.deviceType === 'Apple TV') {
            const sendKey = (name: string) => this.handleRequest({
                method: 'POST',
                uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
                body: {name}
            })

            // Apple TV keys
            switch (value) {
                case '\v':
                    await sendKey('left')
                    break

                case '\f':
                    await sendKey('right')
                    break

                case '\0':
                    await sendKey('up')
                    break

                case '\x18':
                    await sendKey('down')
                    break

                case '\r':
                    await sendKey('select')
                    break

                default:
                    break
            }

            return
        }

        await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/actions`,
            body: {
                actions: [
                    {
                        type: 'key',
                        id: 'keyboard',
                        actions: [
                            {type: 'keyDown', value},
                            {type: 'keyUp', value}
                        ],
                    }
                ]
            }
        })
    }

    async homeBtn() {
        if (this.deviceType === 'Apple TV') {
            await this.handleRequest({
                method: 'POST',
                uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
                body: {name: 'menu'}
            })

            return
        }

        await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
            body: {name: 'home'}
        })
    }

    touchDown(params: TouchParams) {
        if (this.deviceType === 'Apple TV') return

        if (this.touchBusy) {
            // WDA is still processing a previous gesture -- drop this one
            this.touchState = 'idle'
            return
        }

        this.touchState = 'down'
        this.touchStartPos = {x: params.x, y: params.y}
        this.touchStartTime = Date.now()
        this.moveBuffer = []
    }

    touchMove(params: TouchParams) {
        if (this.touchState === 'idle' || this.deviceType === 'Apple TV') return

        // Ignore micro-movements (jitter) while still in 'down' state
        const dx = Math.abs(params.x - this.touchStartPos.x)
        const dy = Math.abs(params.y - this.touchStartPos.y)

        const filtered = this.touchState === 'down' && dx < WdaClient.TAP_MAX_DISTANCE && dy < WdaClient.TAP_MAX_DISTANCE

        if (filtered) {
            return
        }

        this.touchState = 'moving'
        this.moveBuffer.push({x: params.x, y: params.y, time: Date.now()})
    }

    async touchUp() {
        if (this.touchState === 'idle') return

        // Apple TV directional input based on touch position
        if (this.deviceType === 'Apple TV') {
            await this.handleAppleTVTouch()
            this.touchState = 'idle'
            return
        }

        if (!this.deviceSize) {
            this.touchState = 'idle'
            return
        }

        const duration = Date.now() - this.touchStartTime

        this.touchBusy = true
        try {
            if (this.touchState === 'down') {
                // No significant movement -- tap or long press
                if (duration >= WdaClient.TAP_MAX_DURATION_MS) {
                    await this.performLongPress(duration)
                } else {
                    await this.performTap()
                }
            } else {
                // Had movement -- send complete swipe as single W3C action
                await this.performSwipe()
            }
        } finally {
            this.touchBusy = false
        }

        this.touchState = 'idle'
    }

    private async performTap() {
        if (!this.deviceSize) return

        const x = this.touchStartPos.x * this.deviceSize.width
        const y = this.touchStartPos.y * this.deviceSize.height

        await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/touchAndHold`,
            body: {x, y, duration: 0.1}
        })
    }

    private async performLongPress(durationMs: number) {
        if (!this.deviceSize) return

        const x = this.touchStartPos.x * this.deviceSize.width
        const y = this.touchStartPos.y * this.deviceSize.height

        await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/touchAndHold`,
            body: {x, y, duration: durationMs / 1000}
        })
    }

    private static readonly MIN_SWIPE_VELOCITY = 500 // points per second

    private async performSwipe() {
        if (!this.deviceSize || this.moveBuffer.length === 0) return

        const w = this.deviceSize.width
        const h = this.deviceSize.height

        const lastMove = this.moveBuffer[this.moveBuffer.length - 1]

        const fromX = this.touchStartPos.x * w
        const fromY = this.touchStartPos.y * h
        const toX = lastMove.x * w
        const toY = lastMove.y * h

        const dx = toX - fromX
        const dy = toY - fromY
        const distance = Math.sqrt(dx * dx + dy * dy)

        // --- O(n) curvature detection in normalized space, zero allocations ---
        const lineDx = lastMove.x - this.touchStartPos.x
        const lineDy = lastMove.y - this.touchStartPos.y
        const lineLenSq = lineDx * lineDx + lineDy * lineDy

        let maxCrossSq = 0
        for (let i = 0, len = this.moveBuffer.length; i < len; i++) {
            const p = this.moveBuffer[i]
            const cross = (p.y - this.touchStartPos.y) * lineDx - (p.x - this.touchStartPos.x) * lineDy
            const cSq = cross * cross
            if (cSq > maxCrossSq) maxCrossSq = cSq
        }

        const isCurved = lineLenSq > 0 && maxCrossSq > WdaClient.CURVE_THRESHOLD_SQ * lineLenSq

        // Derive velocity from actual gesture speed, with a minimum floor
        const gestureDurationSec = Math.max((lastMove.time - this.touchStartTime) / 1000, 0.05)
        const velocity = Math.max(distance / gestureDurationSec, WdaClient.MIN_SWIPE_VELOCITY)

        if (isCurved) {
            await this.performCurvedSwipe(w, h, gestureDurationSec)
            return
        }

        // Straight line: fast native endpoint (unchanged)
        await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressAndDragWithVelocity`,
            body: {
                fromX,
                fromY,
                toX,
                toY,
                pressDuration: 0,
                velocity,
                holdDuration: 0,
            },
        })
    }

    private async performCurvedSwipe(w: number, h: number, totalDurationSec: number) {
        const buf = this.moveBuffer
        const n = buf.length
        const pointCount = Math.min(n, WdaClient.MAX_CURVE_POINTS)
        const step = n > 1 ? (n - 1) / (pointCount - 1) : 0
        const moveDurationMs = Math.max(Math.round((totalDurationSec * 1000) / (pointCount + 1)), 10)

        const actions: Array<Record<string, unknown>> = [
            {type: 'pointerMove', duration: 0, x: Math.round(this.touchStartPos.x * w), y: Math.round(this.touchStartPos.y * h), origin: 'viewport'},
            {type: 'pointerDown', button: 0},
        ]

        for (let i = 0; i < pointCount; i++) {
            const idx = Math.round(i * step)
            actions.push({
                type: 'pointerMove',
                duration: moveDurationMs,
                x: Math.round(buf[idx].x * w),
                y: Math.round(buf[idx].y * h),
                origin: 'viewport',
            })
        }

        actions.push({type: 'pointerUp', button: 0})

        await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/actions`,
            body: {
                actions: [{
                    type: 'pointer',
                    id: 'finger1',
                    parameters: {pointerType: 'touch'},
                    actions,
                }],
            },
        })
    }

    private async handleAppleTVTouch() {
        if (!this.deviceSize) return

        const x = this.touchStartPos.x * this.deviceSize.width
        const y = this.touchStartPos.y * this.deviceSize.height

        if (x < 0 || y < 0) return

        if (x < 300) {
            await this.pressButtonSendRequest('left')
            return
        }
        if (x > 1650) {
            await this.pressButtonSendRequest('right')
            return
        }
        if (y > 850) {
            await this.pressButtonSendRequest('down')
            return
        }
        if (y < 250) {
            await this.pressButtonSendRequest('up')
            return
        }

        await this.pressButtonSendRequest('select')
    }

    async tapDeviceTreeElement(label: string) {
        const response = await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/elements`,
            body: {
                using: 'link text',
                value: `label=${label}`
            }
        })

        const {ELEMENT} = response.value[0]
        await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/element/${ELEMENT}/click`
        })
    }

    async doubleClick() {
        if (this.touchState === 'moving' || !this.deviceSize) {
            return
        }

        await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/doubleTap`,
            body: {
                x: this.touchStartPos.x * this.deviceSize.width,
                y: this.touchStartPos.y * this.deviceSize.height
            }
        })
    }

    async openUrl(url: string) {
        await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/url`,
            body: {url}
        })
    }

    screenshot() {
        return this.handleRequest({
            method: 'GET',
            uri: `${this.baseUrl}/screenshot`
        })
    }

    async rotation(orientation: IOSOrientation) {
        if (this.isRotating) return
        this.isRotating = true
        await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/orientation`,
            body: {orientation}
        })

        await this.requestOrientation()

        const rotationDegrees = (
            this.orientation ? iosutil.orientationToDegrees(this.orientation) : 0
        ) as RotationDegree

        this.emit('rotation', this.orientation, rotationDegrees)
        this.isRotating = false
    }

    async getTreeElements(): Promise<any | null> {
        return await this.handleRequest({
            method: 'GET',
            uri: `${this.baseUrl}/source?format=json`
        }) || null
    }

    async pressButtonSendRequest(name: string) {
        await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
            body: {name}
        })

        return true
    }

    switchCase() {
        this.upperCase = !this.upperCase
    }

    async appActivate(bundleId: string) {
        await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/apps/activate`,
            body: {bundleId}
        })
    }

    async lock() {
        await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/lock`
        })
    }

    async pressPower() {
        const response = await this.handleRequest({
            method: 'GET',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/locked`
        })

        if (!response) {
            return
        }

        await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/${response?.value ? 'un' : ''}lock`
        })
    }

    async getClipBoard() {
        const response = await this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/getPasteboard`
        })

        if (!response) {
            return 'No clipboard data'
        }

        return Buffer.from(JSON.parse(response).value, 'base64').toString('utf-8') || 'No clipboard data'
    }

    /**
     * Handles WDA HTTP requests with graceful error recovery using native fetch API.
     *
     * WDA can have transient failures that shouldn't crash the device connection.
     * The device notifier and lifecycle manager handle fatal errors separately.
     */
    private handleRequest = async (requestOpt: RequestOptions): Promise<any> => {
        const isTouchReq = requestOpt.uri.includes('/actions') || requestOpt.uri.includes('/touchAndHold') || requestOpt.uri.includes('/doubleTap') || requestOpt.uri.includes('/pressAndDragWithVelocity')
        const startMs = isTouchReq ? Date.now() : 0

        try {
            const response = await fetch(requestOpt.uri, {
                method: requestOpt.method,
                headers: {'Content-Type': 'application/json'},
                body: requestOpt.body ? JSON.stringify(requestOpt.body) : undefined,
                signal: AbortSignal.timeout(this.requestTimeout)
            })

            const body = await response.json()

            return body
        }
        catch (err: any) {
            this.emit('error', new Error(`WDA request error: ${err?.error?.value?.message || err?.message || err}`))
        }
    }

    async pressButton(key: string) {
        const aApple =
            (name: string) => this.appActivate(`com.apple.${name}`)

        switch (key) {
            case 'settings':
                if (this.deviceType === 'Apple TV') {
                    return aApple('TVSettings')
                }

                return aApple('Preferences')

            case 'store':
                if (this.deviceType === 'Apple TV') {
                    return aApple('TVAppStore')
                }

                return aApple('AppStore')

            case 'volume_up':
                return this.pressButtonSendRequest('volumeUp')

            case 'volume_down':
                return this.pressButtonSendRequest('volumeDown')

            case 'power':
                return this.pressPower()

            case 'camera':
                return aApple('camera')

            case 'search':
                if (this.deviceType === 'Apple TV') {
                    return aApple('TVSearch')
                }

                return aApple('mobilesafari')

            case 'finder':
                return aApple('findmy')

            case 'home':
                return this.homeBtn()

            case 'mute':
                for (let i = 0; i < 16; i++) {
                    if (!await this.pressButtonSendRequest('volumeDown')) {
                        return false
                    }
                    await new Promise(r => setTimeout(r, 600))
                }

                return true

            case 'switch_charset':
                return this.switchCase()

            // Media button requests in case there's future WDA compatibility
            case 'media_play_pause':
                return false
            case 'media_stop':
                return false
            case 'media_next':
                return false
            case 'media_previous':
                return false
            case 'media_fast_forward':
                return false
            case 'media_rewind':
                return false
            default:
                return this.pressButtonSendRequest(key)
        }
    }
}
