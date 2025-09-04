import EventEmitter from 'events'
import {exec} from 'child_process'
import {promisify} from 'util'

const execAsync = promisify(exec)

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

    private devices: Map<string, ADBDevice> = new Map()
    private pollTimeout: NodeJS.Timeout | null = null
    private isPolling: boolean = false
    private isDestroyed: boolean = false
    private shouldContinuePolling: boolean = false

    constructor(options?: {intervalMs?: number}) {
        if (ADBObserver.instance) {
            return ADBObserver.instance
        }

        super()
        this.intervalMs = options?.intervalMs || this.intervalMs

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
        ADBObserver.instance = null
    }

    /**
     * Destroy the observer and clean up resources
     */
    destroy(): void {
        this.isDestroyed = true
        this.stop()
        this.devices.clear()
        this.removeAllListeners()
    }

    /**
     * Get all currently tracked devices
     */
    getDevices(): ADBDevice[] {
        return Array.from(this.devices.values())
    }

    /**
     * Get a specific device by serial
     */
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
     * Schedule the next polling cycle using setTimeout
     */
    private scheduleNextPoll(): void {
        if (!this.shouldContinuePolling || this.isDestroyed) {
            return
        }

        this.pollTimeout = setTimeout(async() => {
            await this.pollDevices().catch(err => {
                this.emit('error', err)
            })

            // Schedule next poll if we should continue
            if (this.shouldContinuePolling && !this.isDestroyed) {
                this.scheduleNextPoll()
            }
        }, this.intervalMs)
    }

    /**
     * Execute 'adb devices' and parse the output
     */
    private async getADBDevices(): Promise<ADBDeviceEntry[]> {
        try {
            const {stdout} = await execAsync('adb devices')
            return this.parseADBDevicesOutput(stdout)
        }
        catch (error) {
            throw new Error(`Failed to execute 'adb devices': ${error}`)
        }
    }

    /**
     * Parse the output of 'adb devices' command
     */
    private parseADBDevicesOutput(output: string): ADBDeviceEntry[] {
        const lines = output.trim().split('\n')
        const devices: ADBDeviceEntry[] = []

        // Skip the first line which is "List of devices attached"
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim()
            if (!line) {
                continue
            }

            const parts = line.split(/\s+/)
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
                    // Try to reconnect the device using adb connect (for network devices)
                    // For USB devices, this might not be applicable
                    if (device.serial.includes(':')) {
                        if (this.devices.has(device.serial)) {
                            await execAsync(`adb disconnect ${device.serial}`)
                        }
                        await execAsync(`adb connect ${device.serial}`)
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
