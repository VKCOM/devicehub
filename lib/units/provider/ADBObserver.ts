import EventEmitter from 'events'
import net, {Socket} from 'net'
import {execFile} from 'child_process'

type ADBDeviceType = 'unknown' | 'bootloader' | 'device' | 'recovery' | 'sideload' | 'offline' | 'unauthorized' // https://android.googlesource.com/platform/system/core/+/android-4.4_r1/adb/adb.c#394

interface ADBDevice {
    serial: string
    type: ADBDeviceType
    isStuck: boolean
    reconnect: () => Promise<boolean>
}

interface ADBDeviceEntry {
    serial: string
    state: ADBDevice['type']
}

type PrevADBDeviceType = ADBDevice['type']

interface DeviceHealthCheck {
    attempts: number
    timeout: number
    firstFailureTime: number
    lastAttemptTime: number
}

interface ADBObserverOptions {
    intervalMs?: number
    healthCheckIntervalMs?: number
    host?: string
    port?: number
    adbAutostart?: boolean
    adbPath?: string
    idleReconnectMinutes?: number
}

interface ADBEvents {
    connect: [ADBDevice]
    update: [ADBDevice, PrevADBDeviceType]
    disconnect: [ADBDevice]
    stuck: [ADBDevice, DeviceHealthCheck]
    healthcheck: [{ ok: number, bad: number }]
    /* Emitted when a device is force-reconnected after ADBObserverOptions.idleReconnectMinutes */
    'idle-reconnect': [ADBDevice, {idleMs: number, ok: boolean}]
    error: [Error]
}

export const isOnline = (type: string) => ['device', 'unauthorized'].includes(type)

/*
 * A device is "wireless" when its serial is a `host:port` pair. Those are
 * reconnected with disconnect -> connect, USB devices by restarting adbd.
 */
const isWireless = (serial: string) => serial.includes(':')

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

class ADBObserver extends EventEmitter<ADBEvents> {
    static instance: ADBObserver | null = null

    private readonly intervalMs: number = 1000 // Default 1 second polling
    private readonly healthCheckIntervalMs: number = 30000 // Default 30 sec health check
    private readonly maxHealthCheckAttempts: number = 3

    private readonly host: string = 'localhost'
    private readonly port: number = 5037
    private readonly adbAutostart: boolean = false
    private readonly adbPath: string = 'adb'
    private readonly idleReconnectMs: number = 0
    private readonly requestTimeoutMs: number = 5000 // 5 second timeout per request
    private readonly initialReconnectDelayMs: number = 100
    private readonly maxReconnectAttempts: number = 8

    private devices: Map<string, ADBDevice> = new Map()
    private deviceHealthAttempts: Map<string, DeviceHealthCheck> = new Map()

    private busyDevices: Set<string> = new Set()

    /* When each device last became idle. Absent while the device is busy. */
    private idleSince: Map<string, number> = new Map()

    /* Serials with a reconnect currently in flight, to avoid overlapping ones */
    private reconnecting: Set<string> = new Set()

    private pollTimeout: NodeJS.Timeout | null = null
    private healthCheckTimeout: NodeJS.Timeout | null = null

    private connection: Socket | null = null
    private requestQueue: Array<{
        command: string
        resolve: (value: string) => void
        reject: (error: Error) => void
        needData: boolean
        isRawStream?: boolean // For device commands after transport (shell:, logcat:, etc.)
        timer?: NodeJS.Timeout // Deadline timer, armed as soon as the request is queued
        sent?: boolean // True once written to the socket; cleared if the socket dies before a reply
        rawStreamBuffer?: Buffer // Accumulated data for raw stream responses
        rawStreamStarted?: boolean // True once OKAY received and we're accumulating raw stream data
    }> = []

    /*
     * True while we are tearing down a transport socket on purpose.
     * Such a close is expected and must not be mistaken for the ADB server going away.
     */
    private isTransportTeardown: boolean = false
    private shouldContinuePolling: boolean = false

    /* Completed poll iterations, useful to confirm the poll chain is alive */
    private pollCycle: number = 0
    private isPolling: boolean = false
    private isDestroyed: boolean = false
    private isConnecting: boolean = false
    private isReconnecting: boolean = false
    private isStartingServer: boolean = false

    constructor(options?: ADBObserverOptions) {
        if (ADBObserver.instance) {
            return ADBObserver.instance
        }

        super()
        this.intervalMs = options?.intervalMs || this.intervalMs
        this.healthCheckIntervalMs = options?.healthCheckIntervalMs || this.healthCheckIntervalMs
        this.host = options?.host || this.host
        this.port = options?.port || this.port

        this.adbAutostart = options?.adbAutostart ?? this.adbAutostart
        this.adbPath = options?.adbPath || this.adbPath
        this.idleReconnectMs = Math.max(0, options?.idleReconnectMinutes || 0) * 60_000

        ADBObserver.instance = this
    }

    /*
     * The ADB server only runs locally, so autostart is meaningless when
     * talking to a remote one.
     */
    private get canAutostartADB(): boolean {
        if (!this.adbAutostart) {
            return false
        }

        if (!LOCAL_HOSTS.has(this.host)) {
            return false
        }

        return true
    }

    get count() {
        return this.devices.size
    }

    /**
     * Start monitoring ADB devices
     */
    start(): void {
        if (this.shouldContinuePolling || this.isDestroyed) {
            return
        }

        this.shouldContinuePolling = true
        this.isDestroyed = false

        // Initial poll. Not awaited, and scheduleNextPoll() clears any previous
        // handle, so this can't leave two chains running.
        this.pollDevices()

        this.scheduleNextPoll()
        this.scheduleNextHealthCheck()
    }

    /**
     * Stop monitoring ADB devices
     */
    stop(): void {
        this.shouldContinuePolling = false
        if (this.pollTimeout) {
            clearTimeout(this.pollTimeout)
            this.pollTimeout = null
        }
        if (this.healthCheckTimeout) {
            clearTimeout(this.healthCheckTimeout)
            this.healthCheckTimeout = null
        }
        this.closeConnection()
        ADBObserver.instance = null
    }

    destroy(): void {
        this.isDestroyed = true
        this.stop()
        this.devices.clear()
        this.deviceHealthAttempts.clear()
        this.busyDevices.clear()
        this.idleSince.clear()
        this.reconnecting.clear()
        this.removeAllListeners()
    }

    getDevices(): ADBDevice[] {
        return Array.from(this.devices.values())
    }


    getDevice(serial: string): ADBDevice | undefined {
        return this.devices.get(serial)
    }

    /**
     * Mark a device as rented (busy) or back in the pool (idle).
     *
     * Busy devices are excluded from health checks and idle reconnects: the
     * device worker owns the connection while a user is on it, so probing it
     * adds no information and a hanging probe would stall the whole
     * (sequential) health check cycle.
     */
    setBusy(serial: string, busy: boolean): void {
        if (this.isDestroyed) {
            return
        }

        if (busy) {
            this.busyDevices.add(serial)
            this.idleSince.delete(serial)
            return
        }

        this.busyDevices.delete(serial)

        // Back in the pool: start counting idle time from now and forget any
        // failures accumulated before the device was rented.
        this.idleSince.set(serial, Date.now())
        this.deviceHealthAttempts.delete(serial)
    }

    isBusy(serial: string): boolean {
        return this.busyDevices.has(serial)
    }

    /**
     * Poll ADB devices and emit events for changes
     */
    private async pollDevices(): Promise<void> {
        if (this.isPolling || this.isDestroyed) {
            return
        }

        this.isPolling = true
        this.pollCycle++

        try {
            const currentDevices = await this.getADBDevices()
            const currentSerials = new Set(currentDevices.map(d => d.serial))
            const previousSerials = new Set(this.devices.keys())

            for (const deviceEntry of currentDevices) {
                const existingDevice = this.devices.get(deviceEntry.serial)

                if (!existingDevice) {
                    // New device connected
                    const device = this.createDevice(deviceEntry)
                    this.devices.set(deviceEntry.serial, device)
                    // A freshly seen device starts out idle
                    this.idleSince.set(deviceEntry.serial, Date.now())
                    this.emit('connect', device)
                }
                else if (existingDevice.type !== deviceEntry.state) {
                    // A reconnect is in progress for this device: it is expected
                    // to churn through states while adbd restarts. Stay quiet
                    // until it finishes, then report the settled state once.
                    if (this.reconnecting.has(deviceEntry.serial)) {
                        continue
                    }

                    // Device state changed (update event)
                    const oldType = existingDevice.type
                    existingDevice.type = deviceEntry.state as ADBDevice['type']

                    if (isOnline(existingDevice.type)) {
                        existingDevice.isStuck = false
                    }

                    this.emit('update', existingDevice, oldType)
                }
            }

            // Find disconnected devices (disconnect events)
            for (const serial of previousSerials) {
                if (!currentSerials.has(serial)) {
                    if (this.reconnecting.has(serial)) {
                        continue
                    }

                    const device = this.devices.get(serial)!
                    this.devices.delete(serial)
                    this.deviceHealthAttempts.delete(serial) // Clean up health check tracking
                    this.busyDevices.delete(serial)
                    this.idleSince.delete(serial)
                    this.emit('disconnect', device)
                }
            }
        }
        catch (error: any) {
            this.emit('error', error)
        }
        finally {
            this.isPolling = false
        }
    }

    /**
     * Schedule the next polling cycle
     */
    private scheduleNextPoll(): void {
        if (!this.shouldContinuePolling || this.isDestroyed) {
            return
        }

        if (this.pollTimeout) {
            clearTimeout(this.pollTimeout)
            this.pollTimeout = null
        }

        this.pollTimeout = setTimeout(async() => {
            try {
                await this.pollDevices()
            }
            finally {
                // Never break the chain permanently
                if (this.shouldContinuePolling && !this.isDestroyed) {
                    this.scheduleNextPoll()
                }
            }
        }, this.intervalMs)
    }

    /**
     * Schedule the next health check cycle
     */
    private scheduleNextHealthCheck(): void {
        if (this.isDestroyed) {
            return
        }

        if (this.healthCheckTimeout) {
            clearTimeout(this.healthCheckTimeout)
            this.healthCheckTimeout = null
        }

        this.healthCheckTimeout = setTimeout(async() => {
            try {
                await this.performHealthChecks()
            }
            finally {
                if (!this.isDestroyed) {
                    this.scheduleNextHealthCheck()
                }
            }
        }, this.healthCheckIntervalMs)
    }

    /**
     * Perform health checks on all tracked devices using getprop command
     */
    private async performHealthChecks(): Promise<void> {
        if (this.isDestroyed || this.devices.size === 0) {
            return
        }

        try {
            let now = 0,
                ok = 0,
                bad = 0

            // Check each tracked device
            for (const [serial, device] of this.devices.entries()) {
                if (this.isDestroyed || !this.shouldContinuePolling) {
                    break
                }

                if (device.isStuck || !isOnline(device.type)) {
                    bad++
                    continue
                }

                if (this.busyDevices.has(serial)) {
                    ok++
                    continue
                }

                now = Date.now()

                if (await this.reconnectIfIdleTooLong(serial, device, now)) {
                    continue
                }

                try {
                    if (this.busyDevices.has(serial)) {
                        ok++
                        continue
                    }

                    // Use shell command to check if device is responsive
                    // This is more reliable than get-state
                    await this.sendADBCommand('shell:getprop ro.build.version.sdk', serial)

                    // Device responded successfully - reset failure tracking
                    if (this.deviceHealthAttempts.has(serial)) {
                        this.deviceHealthAttempts.delete(serial)
                    }

                    ok++
                }
                catch (error: any) {
                    console.log(`ADBObserver Healthcheck error: ${error?.message || error}`)

                    if (this.busyDevices.has(serial)) {
                        ok++
                        continue
                    }

                    await this.handleDeviceHealthCheckFailure(serial, device, now)
                    bad++
                }
            }

            this.emit('healthcheck', { ok, bad })
        }
        catch (error: any) {
            this.emit('error', new Error(`Health check failed: ${error.message}`))
        }
    }

    /**
     * Force a reconnect when a device has been idle longer than `idleReconnectMs`
     */
    private async reconnectIfIdleTooLong(serial: string, device: ADBDevice, now: number): Promise<boolean> {
        if (!this.idleReconnectMs || this.busyDevices.has(serial)) {
            return false
        }

        const since = this.idleSince.get(serial)
        if (since === undefined) {
            this.idleSince.set(serial, now)
            return false
        }

        const idleMs = now - since
        if (idleMs < this.idleReconnectMs) {
            return false
        }

        this.idleSince.set(serial, now)

        const ok = await device.reconnect()

        if (this.busyDevices.has(serial)) {
            this.idleSince.delete(serial)
        }

        this.emit('idle-reconnect', device, {idleMs, ok})

        return true
    }

    /**
     * Handle health check failure with backoff and reconnection attempts
     */
    private async handleDeviceHealthCheckFailure(serial: string, device: ADBDevice, now: number): Promise<void> {
        const attemptInfo = this.deviceHealthAttempts.get(serial)

        if (!attemptInfo) {
            // First failure - initialize tracking
            this.deviceHealthAttempts.set(serial, {
                attempts: 1,
                timeout: this.requestTimeoutMs,
                firstFailureTime: now,
                lastAttemptTime: now
            })
            return
        }

        attemptInfo.attempts++
        attemptInfo.lastAttemptTime = now

        if (attemptInfo.attempts >= this.maxHealthCheckAttempts) {
            device.isStuck = true
            this.devices.set(device.serial, device)
            this.emit('stuck', device, attemptInfo)

            // Reset tracking for potential future recovery
            this.deviceHealthAttempts.delete(serial)

            await device.reconnect()
            return
        }
    }

    private async getADBDevices(): Promise<ADBDeviceEntry[]> {
        try {
            const response = await this.sendADBCommand('host:devices')
            return this.parseADBDevicesOutput(response)
        }
        catch (error: any) {
            // No autostart/retry here on purpose: ensureConnection() already
            // starts the server and attemptReconnect() owns the retry loop.
            // Recursing here as well risked unbounded recursion with no backoff.
            throw new Error(`Failed to get ADB devices from ${this.host}:${this.port}: ${error}`)
        }
    }

    /**
     * Establish or reuse persistent connection to ADB server
     */
    private async ensureConnection(): Promise<Socket> {
        if (this.connection && !this.connection.destroyed) {
            return this.connection
        }

        if (this.isConnecting || this.isReconnecting) {
            // Wait for ongoing connection or reconnection attempt
            return new Promise((resolve, reject) => {
                const checkConnection = () => {
                    if (this.connection && !this.connection.destroyed) {
                        resolve(this.connection)
                    }
                    else if (!this.isConnecting && !this.isReconnecting) {
                        reject(new Error('Connection failed'))
                    }
                    else {
                        setTimeout(checkConnection, 10)
                    }
                }
                checkConnection()
            })
        }

        try {
            return await this.createConnection()
        }
        catch (err: any) {
            if ((err?.code === 'ECONNREFUSED' || err?.code === 'ECONNRESET') && this.canAutostartADB) {
                await this.ensureADBServer()
                return this.createConnection()
            }

            throw err
        }
    }

    /**
     * Create new connection to ADB server
     */
    private async createConnection(): Promise<Socket> {
        this.isConnecting = true

        return new Promise((resolve, reject) => {
            const client = net.createConnection({
                port: this.port,
                host: this.host,
                noDelay: true,
                keepAlive: true,
                keepAliveInitialDelay: 30000
            }, () => {
                this.connection = client
                this.isConnecting = false
                this.setupConnectionHandlers(client)
                resolve(client)
            })

            client.on('error', (err) => {
                this.isConnecting = false
                this.connection = null
                reject(err)
            })
        })
    }

    /**
     * Setup event handlers for persistent connection
     */
    private setupConnectionHandlers(client: Socket): void {
        let responseBuffer = Buffer.alloc(0) as Buffer

        client.on('data', (data) => {
            responseBuffer = Buffer.concat([responseBuffer, data])
            responseBuffer = this.processADBResponses(responseBuffer)
        })

        client.on('close', () => {
            this.connection = null

            // Special handling for raw stream in progress - connection close means command completed
            if (this.requestQueue.length > 0 && this.requestQueue[0].rawStreamStarted) {
                const request = this.requestQueue.shift()!
                if (request.timer) {
                    clearTimeout(request.timer)
                }
                const responseData = request.rawStreamBuffer!.toString('utf-8').trim()
                request.resolve(responseData)

                // Process next request in queue (will reconnect if needed)
                if (this.shouldContinuePolling && !this.isDestroyed) {
                    this.processNextRequest()
                }
                return
            }

            // Mark the in-flight request as un-sent so it gets written again on
            // the next socket. Its deadline timer keeps running, so it can never
            // be stranded even if we fail to reconnect.
            if (this.requestQueue.length > 0) {
                this.requestQueue[0].sent = false
            }

            if (!this.shouldContinuePolling || this.isDestroyed) {
                // Reject all queued requests (including in-flight one)
                for (const request of this.requestQueue) {
                    if (request.timer) {
                        clearTimeout(request.timer)
                    }
                    request.reject(new Error('Connection closed'))
                }
                this.requestQueue = []
                return
            }

            // We closed this socket ourselves after a transport session; that is
            // routine, so just continue with a fresh connection instead of
            // treating it as an ADB server outage.
            if (this.isTransportTeardown) {
                this.isTransportTeardown = false
                this.processNextRequest()
                return
            }

            this.attemptReconnect()
        })

        client.on('error', (err) => {
            this.connection = null
            this.emit('error', err)
        })
    }

    /**
     * Process ADB protocol responses and return remaining buffer
     */
    private processADBResponses(buffer: Buffer): Buffer {
        if (!this.requestQueue.length) {
            return buffer
        }

        const request = this.requestQueue[0]!
        let offset = 0

        // Special handling for raw stream that's already started
        // Once OKAY is received for raw stream, we only accumulate data (no more status codes)
        if (request.rawStreamStarted) {
            // Accumulate all data
            if (buffer.length > 0) {
                request.rawStreamBuffer = Buffer.concat([request.rawStreamBuffer || Buffer.alloc(0), buffer])

                // Check if we have a complete line (newline detected)
                // For commands like getprop that return single-line output, complete immediately
                const bufferString = request.rawStreamBuffer.toString('utf-8')
                if (bufferString.includes('\n')) {
                    if (this.requestQueue.length > 0 && this.requestQueue[0] === request) {
                        this.requestQueue.shift()
                        if (request.timer) {
                            clearTimeout(request.timer)
                        }
                        const responseData = bufferString.trim()
                        request.resolve(responseData)

                        // After transport session, close connection for next device/command
                        this.closeConnectionAfterTransport()

                        // Process next request in queue (will reconnect)
                        this.processNextRequest()
                    }
                }
            }

            return Buffer.alloc(0) // All data consumed
        }

        // Check if we have at least status bytes
        if (buffer.length < 4) {
            return buffer
        }

        const status = buffer.subarray(offset, offset + 4).toString('ascii')

        if (status === 'FAIL') {
            // For FAIL responses, we always have length-prefixed error message
            if (buffer.length < 8) {
                return buffer // Need more data for length
            }

            const lengthHex = buffer.subarray(offset + 4, offset + 8).toString('ascii')
            const dataLength = parseInt(lengthHex, 16)

            if (buffer.length < 8 + dataLength) {
                return buffer // Need more data for complete error message
            }

            const errorMessage = buffer.subarray(offset + 8, offset + 8 + dataLength).toString('utf-8')

            if (this.requestQueue.length > 0) {
                const request = this.requestQueue.shift()!
                if (request.timer) {
                    clearTimeout(request.timer)
                }

                request.reject(new Error(errorMessage || 'ADB command failed'))
                this.processNextRequest()
            }

            return buffer.subarray(offset + 8 + dataLength)
        }

        if (status === 'OKAY') {
            offset += 4 // Consume OKAY status

            // Handle different response types based on request
            if (request.isRawStream) {
                // For device commands after transport (shell:, logcat:, etc.)
                // Response is: OKAY + raw unstructured stream (no length prefix)

                // Mark that we've started raw stream mode
                // This prevents processing any further status codes for this request
                request.rawStreamStarted = true
                request.rawStreamBuffer = Buffer.alloc(0)

                // Accumulate any data that came with OKAY in this packet
                if (buffer.length > offset) {
                    request.rawStreamBuffer = Buffer.concat([request.rawStreamBuffer, buffer.subarray(offset)])
                }

                // Check if we already have a complete line (newline detected)
                const bufferString = request.rawStreamBuffer.toString('utf-8')
                if (bufferString.includes('\n')) {
                    if (this.requestQueue.length > 0) {
                        this.requestQueue.shift()
                        if (request.timer) {
                            clearTimeout(request.timer)
                        }
                        const responseData = bufferString.trim()
                        request.resolve(responseData)

                        // After transport session, close connection for next device/command
                        this.closeConnectionAfterTransport()

                        // Process next request in queue (will reconnect if needed)
                        this.processNextRequest()
                    }
                }
                // If no newline yet, wait for more data (will be handled by rawStreamStarted check above)

                return Buffer.alloc(0) // All data consumed
            }
            else if (request.needData) {
                // For host commands with length-prefixed data
                if (buffer.length - offset < 4) {
                    return buffer.subarray(offset - 4) // Need more data for length, return including OKAY
                }

                const lengthHex = buffer.subarray(offset, offset + 4).toString('ascii')
                const dataLength = parseInt(lengthHex, 16)

                if (buffer.length - offset < 4 + dataLength) {
                    return buffer.subarray(offset - 4) // Need more data, return including OKAY
                }

                const responseData = buffer.subarray(offset + 4, offset + 4 + dataLength).toString('utf-8')

                if (this.requestQueue.length > 0) {
                    this.requestQueue.shift()
                    if (request.timer) {
                        clearTimeout(request.timer)
                    }

                    request.resolve(responseData)
                    this.processNextRequest()
                }

                return buffer.subarray(offset + 4 + dataLength)
            }
            else {
                // For commands that only expect OKAY (like host:transport:<serial>)
                if (this.requestQueue.length > 0) {
                    this.requestQueue.shift()
                    if (request.timer) {
                        clearTimeout(request.timer)
                    }

                    request.resolve('')
                    this.processNextRequest()
                }

                return buffer.subarray(offset)
            }
        }

        // Unknown status or need more data
        return buffer
    }

    /**
     * Send command to ADB server using persistent connection
     * Requests are queued and processed sequentially
     */
    private async sendADBCommand(command: string, host?: string): Promise<string> {
        await this.ensureConnection()

        return new Promise((resolve, reject) => {
            if (host) {
                // First, switch to device transport mode
                this.requestQueue.push({
                    command: `host:transport:${host}`,
                    needData: false,
                    resolve: () => {
                        // After transport succeeds, socket is now a tunnel to device's adbd
                        // Device commands (shell:, logcat:, etc.) return raw streams, not length-prefixed data
                        this.requestQueue.push({
                            command,
                            resolve,
                            reject,
                            needData: false,
                            isRawStream: true // Mark as raw stream response
                        })
                        this.processNextRequest()
                    },
                    reject
                })
            } else {
                // Host commands have length-prefixed responses
                this.requestQueue.push({command, resolve, reject, needData: true})
            }

            // Try to process the queue if no request is currently in-flight
            this.processNextRequest()
        })
    }

    /**
     * Process the next request in the queue if no request is currently in-flight
     */
    private processNextRequest(): void {
        // Don't process if queue is empty or first request is already on the wire
        if (this.requestQueue.length === 0 || this.requestQueue[0].sent) {
            return
        }

        // Get the first request in queue (don't shift yet - only shift on response)
        const request = this.requestQueue[0]
        const {command, reject} = request

        // Arm the deadline as soon as the request is queued, not only once it is
        // written. Otherwise a request queued while the socket is down has
        // nothing to ever settle it, which deadlocks the whole queue.
        if (!request.timer) {
            request.timer = setTimeout(() => {
                const index = this.requestQueue.indexOf(request)
                if (index !== -1) {
                    this.requestQueue.splice(index, 1)
                    reject(new Error(`Request timeout after ${this.requestTimeoutMs}ms: ${command}`))
                    // Process next request in queue
                    this.processNextRequest()
                }
            }, this.requestTimeoutMs)
        }

        // No usable socket yet - reconnect and let that resume the queue. The
        // deadline above guarantees the request cannot hang forever.
        if (!this.connection || this.connection.destroyed) {
            if (this.shouldContinuePolling && !this.isDestroyed) {
                this.attemptReconnect()
            }
            return
        }

        // Mark request as on the wire
        request.sent = true

        // Send the command
        const commandBuffer = Buffer.from(command, 'utf-8')
        const lengthHex = commandBuffer.length.toString(16).padStart(4, '0')
        const message = Buffer.concat([
            Buffer.from(lengthHex, 'ascii'),
            commandBuffer
        ])

        this.connection.write(message, (err) => {
            if (err && this.requestQueue.length > 0 && this.requestQueue[0] === request) {
                clearTimeout(request.timer!)
                this.requestQueue.shift() // Remove the failed request
                reject(err)
                // Process next request in queue
                this.processNextRequest()
            }
        })
    }

    /**
     * Start the local ADB server via the adb binary.
     *
     * `start-server` is a no-op when a server is already listening,
     * so this is safe to call speculatively.
     */
    private async ensureADBServer(): Promise<void> {
        if (this.isStartingServer || !this.canAutostartADB) {
            return
        }

        this.isStartingServer = true

        try {
            await new Promise<void>((resolve) => {
                execFile(
                    this.adbPath,
                    ['-P', String(this.port), 'start-server'],
                    {timeout: 20_000},
                    (err, _stdout, stderr) => {
                        if (err) {
                            this.emit('error', new Error(
                                `Failed to start ADB server via "${this.adbPath}": ${stderr?.toString().trim() || err.message}`
                            ))
                        }

                        // Never reject, just retry on the next round
                        resolve()
                    }
                )
            })

            // Wait a moment to bind port
            await new Promise(resolve => setTimeout(resolve, 500))
        }
        finally {
            this.isStartingServer = false
        }
    }

    /**
     * Attempt to reconnect with exponential backoff
     */
    private async attemptReconnect(): Promise<void> {
        if (this.isReconnecting || this.isDestroyed) {
            return
        }

        this.isReconnecting = true

        for (let attempt = 0; attempt < this.maxReconnectAttempts; attempt++) {
            // Calculate exponential backoff delay
            const delay = this.initialReconnectDelayMs * Math.pow(2, attempt)

            await new Promise(resolve => setTimeout(resolve, delay))

            if (!this.shouldContinuePolling || this.isDestroyed) {
                this.isReconnecting = false
                return
            }

            try {
                // Attempt to create a new connection
                await this.createConnection()
                this.isReconnecting = false

                // Resend the in-flight request if it exists
                if (this.requestQueue.length > 0 && !this.requestQueue[0].sent) {
                    // The first request was in-flight but was un-sent on disconnect.
                    // Resend it by calling processNextRequest
                    this.processNextRequest()
                }

                return // Successfully reconnected
            }
            catch (err: any) {
                // The server looks down rather than just unreachable - try to
                // bring it back up before the next attempt.
                //
                // NOTE: this must stay inside the loop. Returning early here
                // would skip createConnection()/processNextRequest() below and
                // strand the in-flight request forever, deadlocking the whole
                // request queue (and with it polling and health checks).
                if (err?.code === 'ECONNREFUSED' || err?.code === 'ECONNRESET') {
                    await this.ensureADBServer()
                }
            }
        }

        // All reconnection attempts failed
        this.isReconnecting = false

        const error = new Error(`Failed to reconnect to ADB server after ${this.maxReconnectAttempts} attempts`)
        this.emit('error', error)

        // Reject all queued requests (including in-flight one)
        for (const request of this.requestQueue) {
            if (request.timer) {
                clearTimeout(request.timer)
            }
            request.reject(error)
        }
        this.requestQueue = []
    }

    /**
     * Close connection after transport session (device-specific command)
     * This is necessary because after host:transport:<serial>, the socket becomes
     * a dedicated tunnel to that device and cannot be reused for other commands
     */
    private closeConnectionAfterTransport(): void {
        if (this.connection && !this.connection.destroyed) {
            // Tell the 'close' handler this teardown is intentional
            this.isTransportTeardown = true
            this.connection.destroy()
            this.connection = null
        }

        // Don't reject queued requests - they will be processed with a new connection
        // Don't reset reconnection state - let it continue if needed
    }

    /**
     * Close the persistent connection
     */
    private closeConnection(): void {
        if (this.connection && !this.connection.destroyed) {
            this.connection.destroy()
            this.connection = null
        }

        this.isReconnecting = false

        // Reject all queued requests (including in-flight one)
        for (const request of this.requestQueue) {
            if (request.timer) {
                clearTimeout(request.timer)
            }
            request.reject(new Error('Connection closed'))
        }
        this.requestQueue = []
    }

    /**
     * Parse the output of 'adb devices' command from ADB protocol response
     */
    private parseADBDevicesOutput(output: string): ADBDeviceEntry[] {
        const lines = output.trim().split('\n')
        const devices: ADBDeviceEntry[] = []

        // Parse each line directly (no header line in protocol response)
        for (const line of lines) {
            const trimmedLine = line.trim()
            if (!trimmedLine) {
                continue
            }

            const parts = trimmedLine.split(/\s+/)
            if (parts.length >= 2) {
                const serial = parts[0]
                const state = parts[1] as ADBDevice['type']
                devices.push({serial, state})
            }
        }

        return devices
    }

    /**
     * Create a device object from ADB device entry
     */
    private createDevice(deviceEntry: ADBDeviceEntry): ADBDevice {
        const device: ADBDevice = {
            serial: deviceEntry.serial,
            type: deviceEntry.state,
            isStuck: false,
            reconnect: async(): Promise<boolean> => {
                if (this.isDestroyed) {
                    return false
                }

                // Only one reconnect per device at a time: both the health check
                // failure path and the idle path can ask for one.
                if (this.reconnecting.has(device.serial)) {
                    return false
                }

                this.reconnecting.add(device.serial)

                const prev = device.type

                try {
                    if (isWireless(device.serial)) {
                        // Wireless devices are reconnected by dropping and
                        // re-establishing the TCP connection.
                        if (this.devices.has(device.serial)) {
                            try {
                                await this.sendADBCommand(`host:disconnect:${device.serial}`)
                            }
                            catch {
                                // Ignore disconnect errors
                            }
                        }

                        await this.sendADBCommand(`host:connect:${device.serial}`)
                    }
                    else {
                        // A USB device can only be reconnected while it still has
                        // a working transport, because the command travels to the
                        // device. An already offline device is left alone: it will
                        // be escalated to "stuck" by the health check instead.
                        if (!isOnline(prev)) {
                            return false
                        }

                        // Restart adbd on the device (`adb -s <serial> usb`).
                        //
                        // NOTE: deliberately NOT `host-serial:<serial>:reconnect`.
                        // That is handled by the ADB server itself: it closes the
                        // USB handle but keeps the stale entry in its device list,
                        // so the device is never re-opened by the server's rescan
                        // and stays invisible until `adb kill-server`. Restarting
                        // adbd makes the device re-enumerate cleanly instead, and
                        // is safe to repeat.
                        const response = await this.sendADBCommand('usb:', device.serial)

                        if (!/restarting in USB mode/i.test(response)) {
                            return false
                        }
                    }

                    // Give the device a moment to come back
                    await new Promise(resolve => setTimeout(resolve, 1500))

                    // Whether the device actually came back is decided by the
                    // device list, not by the reply text.
                    const devices = await this.getADBDevices()
                    const reconnectedDevice = devices.find(d =>
                        d.serial === device.serial
                    )

                    if (reconnectedDevice && isOnline(reconnectedDevice.state)) {
                        device.isStuck = false

                        // Only report a change if the device settled on a
                        // different state than it had before the reconnect.
                        // Announcing an unchanged "device" state would make the
                        // provider start a second worker for a device that is
                        // already being served.
                        if (device.type !== reconnectedDevice.state) {
                            const oldType = device.type
                            device.type = reconnectedDevice.state
                            this.emit('update', device, oldType)
                        }

                        return true
                    }

                    // The device did not come back. Surface it now, since polling
                    // stayed silent while the reconnect was in flight.
                    if (!reconnectedDevice) {
                        this.devices.delete(device.serial)
                        this.deviceHealthAttempts.delete(device.serial)
                        this.busyDevices.delete(device.serial)
                        this.idleSince.delete(device.serial)
                        this.emit('disconnect', device)
                    }
                    else if (device.type !== reconnectedDevice.state) {
                        const oldType = device.type
                        device.type = reconnectedDevice.state
                        this.emit('update', device, oldType)
                    }

                    return false
                }
                catch {
                    return false
                }
                finally {
                    this.reconnecting.delete(device.serial)
                }
            }
        }

        return device
    }
}

export default ADBObserver
export {ADBObserver, ADBDevice, ADBDeviceType}
