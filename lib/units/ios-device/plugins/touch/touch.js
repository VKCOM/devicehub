import HID from 'node-hid'

/**
 * @implements {ITouch}
 */
export class IMouseTouch {

    /**
     * IMouseTouch controls the devices using a HID interface of an iMouse PCB
     * @param {number} width screen width
     * @param {number} height screen width
     * @param {string} hidPath path to hid device
     */
    constructor(width, height, hidPath) {
        this.width = width
        this.height = height
        this.hidPath = hidPath
    }

    async move(x, y) {
        throw new Error('Method not implemented.')
    }
    async touchDown() {
        throw new Error('Method not implemented.')
    }
    async touchUp() {
        throw new Error('Method not implemented.')
    }


    /**
     * @returns {Promise<HID.Device[]>} devices
     */
    static async readIMouseDevices() {
        const devices = HID.devices()
        const imouseDevices = devices.filter((device) => device.vendorId === 29197) // TODO: hard coded literal?
        return imouseDevices
    }
}
