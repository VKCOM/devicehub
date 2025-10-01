import EventEmitter from 'events'
import net, {Socket} from 'net'

export type ADBDeviceType = 'unknown' | 'bootloader' | 'device' | 'recovery' | 'sideload' | 'offline' | 'unauthorized' | 'unknown' // https://android.googlesource.com/platform/system/core/+/android-4.4_r1/adb/adb.c#394

interface ADBDevice {
    serial: string
    type: ADBDeviceType
    reconnect: () => Promise<boolean>
}

interface ADBDeviceEntry {
    serial: string
    state: ADBDevice['type']
}

type PrevADBDeviceType = ADBDevice['type']

interface ADBEvents {
    connect: [ADBDevice]
    update: [ADBDevice, PrevADBDeviceType]
    disconnect: [ADBDevice]
    error: [Error]
}

class ADBObserver extends EventEmitter<ADBEvents> {
    static instance: ADBObserver | null = null

    private readonly intervalMs: number = 1000 // Default 1 second polling
    private readonly host: string = 'localhost'
    private readonly port: number = 5037

    private devices: Map<string, ADBDevice> = new Map()
    private pollTimeout: NodeJS.Timeout | null = null
    private isPolling: boolean = false
    private isDestroyed: boolean = false
    private shouldContinuePolling: boolean = false
    private connection: Socket | null = null
    private isConnecting: boolean = false
    private requestQueue: Array<{
        command: string
        resolve: (value: string) => void
        reject: (error: Error) => void
        timer?: NodeJS.Timeout // Set when request is in-flight
    }> = []
    private readonly requestTimeoutMs: number = 5000 // 5 second timeout per request
    private readonly maxReconnectAttempts: number = 8
    private readonly initialReconnectDelayMs: number = 100
    private reconnectAttempt: number = 0
    private isReconnecting: boolean = false

    constructor(options?: {intervalMs?: number; host?: string; port?: number}) {
        if (ADBObserver.instance) {
            return ADBObserver.instance
        }

        super()
        this.intervalMs = options?.intervalMs || this.intervalMs
        this.host = options?.host || this.host
        this.port = options?.port || this.port

        ADBObserver.instance = this
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

        // Initial poll
        this.pollDevices()

        this.scheduleNextPoll()
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
        this.closeConnection()
        ADBObserver.instance = null
    }

    destroy(): void {
        this.isDestroyed = true
        this.stop()
        this.devices.clear()
        this.removeAllListeners()
    }

    getDevices(): ADBDevice[] {
        return Array.from(this.devices.values())
    }


    getDevice(serial: string): ADBDevice | undefined {
        return this.devices.get(serial)
    }

    /**
     * Poll ADB devices and emit events for changes
     */
    private async pollDevices(): Promise<void> {
        if (this.isPolling || this.isDestroyed) {
            return
        }

        this.isPolling = true

        try {
            const currentDevices = await this.getADBDevices()
            const currentSerials = new Set(currentDevices.map(d => d.serial))
            const previousSerials = new Set(this.devices.keys())

            // Find new devices (connect events)
            for (const deviceEntry of currentDevices) {
                const existingDevice = this.devices.get(deviceEntry.serial)

                if (!existingDevice) {
                    // New device connected
                    const device = this.createDevice(deviceEntry)
                    this.devices.set(deviceEntry.serial, device)
                    this.emit('connect', device)
                }
                else if (existingDevice.type !== deviceEntry.state) {
                    // Device state changed (update event)
                    const oldType = existingDevice.type
                    existingDevice.type = deviceEntry.state as ADBDevice['type']
                    this.emit('update', existingDevice, oldType)
                }
            }

            // Find disconnected devices (disconnect events)
            for (const serial of previousSerials) {
                if (!currentSerials.has(serial)) {
                    const device = this.devices.get(serial)!
                    this.devices.delete(serial)
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

        this.pollTimeout = setTimeout(async() => {
            await this.pollDevices()

            if (this.shouldContinuePolling && !this.isDestroyed) {
                this.scheduleNextPoll()
            }
        }, this.intervalMs)
    }

    private async getADBDevices(): Promise<ADBDeviceEntry[]> {
        try {
            const response = await this.sendADBCommand('host:devices')
            return this.parseADBDevicesOutput(response)
        }
        catch (error) {
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

        return this.createConnection()
    }

    /**
     * Create new connection to ADB server
     */
    private async createConnection(): Promise<Socket> {
        this.isConnecting = true

        return new Promise((resolve, reject) => {
            const client = net.createConnection(this.port, this.host, () => {
                this.connection = client
                this.isConnecting = false
                this.reconnectAttempt = 0 // Reset reconnection counter on successful connection
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

            // Clear the timeout of in-flight request but keep it for potential retry
            if (this.requestQueue.length > 0 && this.requestQueue[0].timer) {
                clearTimeout(this.requestQueue[0].timer)
                delete this.requestQueue[0].timer
            }

            // Attempt to reconnect if we should continue polling
            if (this.shouldContinuePolling && !this.isDestroyed) {
                this.attemptReconnect()
            }
            else {
                // Reject all queued requests (including in-flight one)
                for (const {reject} of this.requestQueue) {
                    reject(new Error('Connection closed'))
                }
                this.requestQueue = []
            }
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
        let offset = 0

        while (offset < buffer.length) {
            // Need at least 8 bytes for status (4) + length (4)
            if (buffer.length - offset < 8) {
                break
            }

            const status = buffer.subarray(offset, offset + 4).toString('ascii')
            const lengthHex = buffer.subarray(offset + 4, offset + 8).toString('ascii')
            const dataLength = parseInt(lengthHex, 16)

            // Check if we have the complete response
            if (buffer.length - offset < 8 + dataLength) {
                break
            }

            const responseData = buffer.subarray(offset + 8, offset + 8 + dataLength).toString('utf-8')

            if (status === 'OKAY') {
                // Resolve the in-flight request (first in queue)
                if (this.requestQueue.length > 0) {
                    const request = this.requestQueue.shift()!
                    if (request.timer) {
                        clearTimeout(request.timer)
                    }
                    request.resolve(responseData)
                    // Process next request in queue
                    this.processNextRequest()
                }
            }
            else if (status === 'FAIL') {
                // Reject the in-flight request (first in queue)
                if (this.requestQueue.length > 0) {
                    const request = this.requestQueue.shift()!
                    if (request.timer) {
                        clearTimeout(request.timer)
                    }
                    request.reject(new Error(responseData || 'ADB command failed'))
                    // Process next request in queue
                    this.processNextRequest()
                }
            }

            offset += 8 + dataLength
        }

        // Return remaining incomplete data in buffer
        return offset > 0 ? buffer.subarray(offset) : buffer
    }

    /**
     * Send command to ADB server using persistent connection
     * Requests are queued and processed sequentially
     */
    private async sendADBCommand(command: string): Promise<string> {
        await this.ensureConnection()

        return new Promise((resolve, reject) => {
            // Add request to the queue
            this.requestQueue.push({command, resolve, reject})

            // Try to process the queue if no request is currently in-flight
            this.processNextRequest()
        })
    }

    /**
     * Process the next request in the queue if no request is currently in-flight
     */
    private processNextRequest(): void {
        // Don't process if queue is empty or first request already in-flight
        if (this.requestQueue.length === 0 || this.requestQueue[0].timer) {
            return
        }

        // Don't process if connection is not available
        if (!this.connection || this.connection.destroyed) {
            return
        }

        // Get the first request in queue (don't shift yet - only shift on response)
        const request = this.requestQueue[0]
        const {command, reject} = request

        // Set up timeout for this request
        const timer = setTimeout(() => {
            if (this.requestQueue.length > 0 && this.requestQueue[0] === request) {
                this.requestQueue.shift() // Remove the timed-out request
                reject(new Error(`Request timeout after ${this.requestTimeoutMs}ms: ${command}`))
                // Process next request in queue
                this.processNextRequest()
            }
        }, this.requestTimeoutMs)

        // Mark request as in-flight by setting its timer
        request.timer = timer

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
     * Attempt to reconnect with exponential backoff
     */
    private async attemptReconnect(): Promise<void> {
        if (this.isReconnecting || this.isDestroyed) {
            return
        }

        this.isReconnecting = true

        for (let attempt = 0; attempt < this.maxReconnectAttempts; attempt++) {
            this.reconnectAttempt = attempt + 1

            // Calculate exponential backoff delay
            const delay = this.initialReconnectDelayMs * Math.pow(2, attempt)

            // Wait before attempting reconnection
            await new Promise(resolve => setTimeout(resolve, delay))

            if (!this.shouldContinuePolling || this.isDestroyed) {
                this.isReconnecting = false
                return
            }

            try {
                // Attempt to create a new connection
                await this.createConnection()
                this.reconnectAttempt = 0
                this.isReconnecting = false

                // Resend the in-flight request if it exists
                if (this.requestQueue.length > 0 && !this.requestQueue[0].timer) {
                    // The first request was in-flight but timer was cleared on disconnect
                    // Resend it by calling processNextRequest
                    this.processNextRequest()
                }

                return // Successfully reconnected
            }
            catch {
                // Continue to next attempt
                continue
            }
        }

        // All reconnection attempts failed
        this.isReconnecting = false
        this.reconnectAttempt = 0

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
     * Close the persistent connection
     */
    private closeConnection(): void {
        if (this.connection && !this.connection.destroyed) {
            this.connection.destroy()
            this.connection = null
        }

        // Reset reconnection state
        this.isReconnecting = false
        this.reconnectAttempt = 0

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
            reconnect: async(): Promise<boolean> => {
                try {
                    // Try to reconnect the device using ADB protocol (for network devices)
                    // For USB devices, this might not be applicable
                    if (device.serial.includes(':')) {
                        if (this.devices.has(device.serial)) {
                            try {
                                await this.sendADBCommand(`host:disconnect:${device.serial}`)
                            }
                            catch {
                                // Ignore disconnect errors
                            }
                        }

                        await this.sendADBCommand(`host:connect:${device.serial}`)
                        await new Promise(resolve => setTimeout(resolve, 1000))

                        const devices = await this.getADBDevices()
                        const reconnectedDevice = devices.find(d => d.serial === device.serial)

                        if (reconnectedDevice && reconnectedDevice.state === 'device') {
                            device.type = 'device'
                            return true
                        }
                    }

                    return false
                }
                catch {
                    return false
                }
            }
        }

        return device
    }
}

export default ADBObserver
export {ADBDevice, ADBObserver}
