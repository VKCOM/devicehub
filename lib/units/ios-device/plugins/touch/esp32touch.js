import {SerialPort} from 'serialport'
import Logger from '../../../../util/logger.js'
import EventEmitter from 'node:events'
import {getDirection, getStep, SINGLE_STEP_SIZE, BIG_STEP_SIZE, HUGE_STEP_SIZE, POSITION_TOLERANCE} from './esp32-movement.js'


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
    static SINGLE_STEP_SIZE = SINGLE_STEP_SIZE
    static BIG_STEP_SIZE = BIG_STEP_SIZE
    static HUGE_STEP_SIZE = HUGE_STEP_SIZE
    static POSITION_TOLERANCE = POSITION_TOLERANCE

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
        this.curposX = Esp32Touch.SINGLE_STEP_SIZE * 14
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

            if (this.targetPosX === null || this.targetPosY === null) {
                return
            }
            const targetStepsX = Math.round(this.targetPosX * this.width)
            const targetStepsY = Math.round(this.targetPosY * this.height)
            const diffX = targetStepsX - this.curposX // Positive -> right, negative -> left
            const diffY = targetStepsY - this.curposY // Positive -> down, negative -> up

            if (Math.abs(diffX) <= Esp32Touch.POSITION_TOLERANCE && Math.abs(diffY) <= Esp32Touch.POSITION_TOLERANCE) {
                return
            }

            const moveX = Math.abs(diffX) >= Math.abs(diffY)
            const step = getStep(moveX ? diffX : diffY)
            // Move the axis with the larger remaining error first. Randomly
            // choosing an axis makes the estimated position unstable.
            let dir, addX, addY
            if (moveX) {
                [dir, addX, addY] = [getDirection('x', step), step, 0]
            }
            else {
                [dir, addX, addY] = [getDirection('y', step), 0, step]
            }
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
        this.targetPosY = targetY
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
