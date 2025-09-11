import EventEmitter from 'events'
import net, {Socket} from 'net'

interface ADBDevice {
    serial: string
    type: 'device' | 'unknown' | 'offline' | 'unauthorized' | 'recovery'
    reconnect: () => Promise<boolean>
}

interface ADBDeviceEntry {
    serial: string
    state: ADBDevice['type']
}

class ADBObserver extends EventEmitter {
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
    private pendingRequests: Map<string, {resolve: (value: string) => void; reject: (error: Error) => void}> = new Map()

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
        this.pollDevices().catch(err => {
            this.emit('error', err)
        })

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
        catch (error) {
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
            await this.pollDevices().catch(err => {
                this.emit('error', err)
            })

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

        if (this.isConnecting) {
            // Wait for ongoing connection attempt
            return new Promise((resolve, reject) => {
                const checkConnection = () => {
                    if (this.connection && !this.connection.destroyed) {
                        resolve(this.connection)
                    }
                    else if (!this.isConnecting) {
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
        let responseBuffer = Buffer.alloc(0)

        client.on('data', (data) => {
            responseBuffer = Buffer.concat([responseBuffer, data])
            responseBuffer = this.processADBResponses(responseBuffer)
        })

        client.on('close', () => {
            this.connection = null
            // Reject any pending requests
            for (const [, {reject}] of this.pendingRequests) {
                reject(new Error('Connection closed'))
            }
            this.pendingRequests.clear()
            
            // Auto-reconnect if we should continue polling
            if (this.shouldContinuePolling && !this.isDestroyed) {
                this.ensureConnection().catch(err => {
                    this.emit('error', err)
                })
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
                // Find and resolve the corresponding request
                const requestId = 'host:devices' // For now, we only handle device listing
                const pending = this.pendingRequests.get(requestId)
                if (pending) {
                    this.pendingRequests.delete(requestId)
                    pending.resolve(responseData)
                }
            }
            else if (status === 'FAIL') {
                const requestId = 'host:devices'
                const pending = this.pendingRequests.get(requestId)
                if (pending) {
                    this.pendingRequests.delete(requestId)
                    pending.reject(new Error(responseData || 'ADB command failed'))
                }
            }

            offset += 8 + dataLength
        }

        // Return remaining incomplete data in buffer
        return offset > 0 ? buffer.subarray(offset) : buffer
    }

    /**
     * Send command to ADB server using persistent connection
     */
    private async sendADBCommand(command: string): Promise<string> {
        const connection = await this.ensureConnection()
        
        return new Promise((resolve, reject) => {
            // Store the request for response matching
            this.pendingRequests.set(command, {resolve, reject})

            const commandBuffer = Buffer.from(command, 'utf-8')
            const lengthHex = commandBuffer.length.toString(16).padStart(4, '0')
            const message = Buffer.concat([
                Buffer.from(lengthHex, 'ascii'),
                commandBuffer
            ])

            connection.write(message, (err) => {
                if (err) {
                    this.pendingRequests.delete(command)
                    reject(err)
                }
            })
        })
    }

    /**
     * Close the persistent connection
     */
    private closeConnection(): void {
        if (this.connection && !this.connection.destroyed) {
            this.connection.destroy()
            this.connection = null
        }
        
        // Reject any pending requests
        for (const [, {reject}] of this.pendingRequests) {
            reject(new Error('Connection closed'))
        }
        this.pendingRequests.clear()
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
