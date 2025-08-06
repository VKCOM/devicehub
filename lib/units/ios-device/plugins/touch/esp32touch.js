import {SerialPort} from 'serialport'
import Logger from '../../../../util/logger.js'
import {promisify} from 'node:util'
import _ from 'lodash'
import EventEmitter from 'node:events'


const log = Logger.createLogger('esp32touch')

const SEND_INTERVAL = 15 // in ms

function throttle(func, ms) {

    let isThrottled = false,
            savedArgs,
            savedThis

    function wrapper() {

        if (isThrottled) { // (2)
            savedArgs = arguments
            // eslint-disable-next-line consistent-this
            savedThis = this
            return
        }

        func.apply(this, arguments) // (1)

        isThrottled = true

        setTimeout(function() {
            isThrottled = false // (3)
            if (savedArgs) {
                wrapper.apply(savedThis, savedArgs)
                savedArgs = savedThis = null
            }
        }, ms)
    }

    return wrapper
}

/** @typedef {"paired" | "connected" | "disconnected" | "ready" | "booting"} Esp32TouchState */

/**
 * Controller for communicating with an ESP32 BLE Mouse over Serial.
 */
export class Esp32Touch extends EventEmitter {
    static MAX_BLE_NAME_LENGTH = 22 // Match the safe limit for advertising
    static SINGLE_STEP_SIZE = 13 / 3 // The amount of pixels a single step does.
    static BIG_STEP_SIZE = 70 / 3 // The amount of pixels a big step does.
    static HUGE_STEP_SIZE = 178 / 3 // The amount of pixels a huge step does

    static async listPorts() {
        return (await SerialPort.list()).filter((dev) => dev.manufacturer === 'Espressif')
    }

    reboot() {
        this.bufferCommand('-')
        this.updateState('booting')
    }

    /**
     *
     * @param {Esp32TouchState} newState
     */
    updateState(newState) {
        this.state = newState
        this.emit(newState)
    }


    /**
     * Create a new mouse controller.
     * @param {string} portPath - Path to the serial port.
     * @param {number} width - width of screen in pixels
     * @param {number} height - height of screen in pixels
     */
    constructor(width, height, portPath) {
        super()
        this.port = new SerialPort({
            path: portPath,
            baudRate: 115200,
            autoOpen: true
        })
        this.port.write('-')
        this.port.on('data', (data) => {
            if(Buffer.isBuffer(data)) {
                const c = data.toString()
                console.log(JSON.stringify(c))
                if(c === 'P\r\n') {
                    this.curposX = null
                    this.curposY = null
                    this.updateState('paired')
                }
                else if (c === 'C\r\n') {
                    this.curposX = null
                    this.curposY = null
                    this.updateState('connected')
                }
                else if (c === 'D\r\n') {
                    this.curposX = null
                    this.curposY = null
                    this.updateState('disconnected')
                }
                else if (c === '<R>\r\n') {
                    this.curposX = null
                    this.curposY = null
                    this.updateState('ready')
                }
                else if (c === 'L\r\n') {
                    this.curposX = null
                    this.curposY = null
                    this.updateState('booting')
                }
            }
            else {
                log.debug(data)
            }
        })

        this.buffer = ''

        /** @type {number | null} */
        this.curposX = null

        /** @type {number | null} */
        this.curposY = null

        /** @type {number | null} */
        this.targetPosX = null

        /** @type {number | null} */
        this.targetPosY = null
        this.width = width
        this.height = height

        this.workerInterval = null
    }

    /**
     * Buffer a command to be sent.
     * @param {string} cmd - Command string to send.
     * @private
     */
    bufferCommand(cmd) {
        if (cmd) {
            this.port.write(cmd, (err) => {
                if (err) {
                    console.error('Serial write error:', err.message)
                }
            })
        }
    }

    /**
     * Set the Bluetooth device name.
     * @param {string} name - New BLE device name.
     */
    setName(name) {
        let realName = name
        if (name.length > Esp32Touch.MAX_BLE_NAME_LENGTH) {
            log.warn(`BLE name too long (${name.length} chars). Truncating to ${Esp32Touch.MAX_BLE_NAME_LENGTH} chars.`)
            realName = name.substring(0, Esp32Touch.MAX_BLE_NAME_LENGTH)
        }
        this.bufferCommand(`N${realName}\n`)
    }
    reset() {
        this.bufferCommand('0')
        this.curposX = 14 * Esp32Touch.SINGLE_STEP_SIZE
        this.curposY = 0
    }

    startWorking() {
        if(this.workerInterval !== null) {
            return
        }

        log.info('Starting mouse movement worker.')
        this.workerInterval = setInterval(() => {
            if (this.curposX === null || this.curposY === null) {
                this.reset()
            }
            if (this.curposX === null || this.curposY === null) {
                log.error('Failed to reset')
                return
            }

            if(this.targetPosX === null || this.targetPoxY === null) {
                return
            }
            const targetStepsX = Math.round(this.targetPosX * this.width)
            const targetStepsY = Math.round(this.targetPoxY * this.height)
            const diffX = targetStepsX - this.curposX // Positive -> left, negative - right
            const diffY = targetStepsY - this.curposY // Positive -> up, negative - down
            /** @type {[string, number, number][]} */
            let commands = []
            if(diffX > Esp32Touch.HUGE_STEP_SIZE * 1.5) {
                commands.push(['k', Esp32Touch.HUGE_STEP_SIZE, 0])
            }
            if(diffX < -Esp32Touch.HUGE_STEP_SIZE * 1.5) {
                commands.push(['g', -Esp32Touch.HUGE_STEP_SIZE, 0])
            }
            if(diffY > Esp32Touch.HUGE_STEP_SIZE * 1.5) {
                commands.push(['h', 0, Esp32Touch.HUGE_STEP_SIZE])
            }
            if(diffY < -Esp32Touch.HUGE_STEP_SIZE * 1.5) {
                commands.push(['j', 0, -Esp32Touch.HUGE_STEP_SIZE])
            }
            if (commands.length === 0) {
                if(diffX > Esp32Touch.BIG_STEP_SIZE * 1.5) {
                    commands.push(['r', Esp32Touch.BIG_STEP_SIZE, 0])
                }
                if(diffX < -Esp32Touch.BIG_STEP_SIZE * 1.5) {
                    commands.push(['l', -Esp32Touch.BIG_STEP_SIZE, 0])
                }
                if(diffY > Esp32Touch.BIG_STEP_SIZE * 1.5) {
                    commands.push(['d', 0, Esp32Touch.BIG_STEP_SIZE])
                }
                if(diffY < -Esp32Touch.BIG_STEP_SIZE * 1.5) {
                    commands.push(['u', 0, -Esp32Touch.BIG_STEP_SIZE])
                }
                if(commands.length === 0) {
                    if(diffX > Esp32Touch.SINGLE_STEP_SIZE) {
                        commands.push(['R', Esp32Touch.SINGLE_STEP_SIZE, 0])
                    }
                    if(diffX < -Esp32Touch.SINGLE_STEP_SIZE) {
                        commands.push(['L', -Esp32Touch.SINGLE_STEP_SIZE, 0])
                    }
                    if(diffY > Esp32Touch.SINGLE_STEP_SIZE) {
                        commands.push(['D', 0, Esp32Touch.SINGLE_STEP_SIZE])
                    }
                    if(diffY < -Esp32Touch.SINGLE_STEP_SIZE) {
                        commands.push(['U', 0, -Esp32Touch.SINGLE_STEP_SIZE])
                    }
                }
            }
            const [dir, addX, addY] = _.sample(commands) ?? ['', 0, 0]
            if (dir) {
                this.bufferCommand(dir)
                this.curposX += addX
                this.curposY += addY
            }

        }, SEND_INTERVAL)
    }

    /**
     * Move the mouse cursor to point.
     * @param {number} targetX
     * @param {number} targetY
     */
    move(targetX, targetY) {
        this.startWorking()
        this.targetPosX = targetX
        this.targetPoxY = targetY
    }

    /**
     * Press the left mouse button.
     */
    press() {
        this.bufferCommand('P')
    }

    /**
     * Release the left mouse button.
     */
    release() {
        this.bufferCommand('O')
    }
}
