import EventEmitter from 'node:events'
import {spawn} from 'child_process'
import usb from 'usb-hotplug'

type IsSimulator = boolean

interface IOSSimEvents {
    attached: [string, IsSimulator]
    detached: [string, IsSimulator]
}

export default class IOSObserver extends EventEmitter<IOSSimEvents> {

    private sims = new Set<string>()
    private usbListenerStarted = false
    listnerInterval: NodeJS.Timeout | undefined

    constructor() {
        super()
    }

    getXCRunSimctlDevices = (): Promise<string[]> =>
        new Promise((resolve, reject) => {
            const proc = spawn('sh', [
                '-c',
                `xcrun simctl list devices | grep "(Booted)" | grep -E -o "([0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12})" || true`
            ], {
                timeout: 10 * 60 * 1000,
                stdio: ['ignore', 'pipe', 'pipe']
            })

            let output = ''

            proc.stdout?.on('data', (data: Buffer) => {
                output += data.toString()
            })

            proc.on('error', reject)

            proc.once('exit', (code) => {
                proc.removeAllListeners('data')
                proc.removeAllListeners('error')

                // Exit codes 0 and 1 are acceptable (1 means grep found no matches)
                if (code !== null && code > 1) {
                    reject(new Error(`Process exited with code ${code}`))
                    return
                }

                const lines = output.trim().split('\n').filter(line => line.trim())
                resolve(lines)
            })
        })

    async processSimulators(): Promise<void> {
        const devices = await this.getXCRunSimctlDevices()

        for (const udid of Array.from(this.sims)) {
            if (!devices.includes(udid)) {
                this.sims.delete(udid)
                this.emit('detached', udid, true)
            }
        }

        for (const device of devices) {
            if (!this.sims.has(device)) {
                this.sims.add(device)
                this.emit('attached', device, true)
            }
        }
    }

    private formatUDID(serial: string): string {
        if (serial.length === 24) {
            return `${serial.slice(0, 8)}-${serial.slice(8)}`.toUpperCase()
        } else if (serial.length === 40) {
            return serial.toLowerCase()
        }

        return serial
    }

    listen = (): void => {
        new Promise(async() => {
            if (!this.usbListenerStarted) {
                const currentDevices = usb.listDevices()
                for (const device of currentDevices) {
                    if (!device.serialNumber || device.vendorId !== 1452) continue
                    this.emit('attached', this.formatUDID(device.serialNumber), false)
                }

                usb.watchDevices((err, event) => {
                    if (!event.serialNumber) {
                        return
                    }

                    if (event.eventType === 'Connected' && event.device?.vendorId === 1452) {
                        this.emit('attached', this.formatUDID(event.serialNumber), false)
                    } else {
                        this.emit('detached', this.formatUDID(event.serialNumber), false)
                    }
                })

                this.usbListenerStarted = true
            }

            await this.processSimulators()

            this.listnerInterval = setTimeout(this.listen, 2_000)
        })
    }

    stop(): void {
        if (this.usbListenerStarted) {
            usb.stopWatching()
        }
        clearTimeout(this.listnerInterval)
    }
}

