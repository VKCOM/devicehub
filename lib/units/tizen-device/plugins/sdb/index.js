import syrup from '@devicefarmer/stf-syrup'
import {SDB} from 'appium-sdb'

export class SDBClient extends SDB {

    /** @type {string | undefined} */
    serial

    /**
     * @param {string} pkg
     * @returns {Promise<{pkg: string, pid: number, port: number}>} */
    debugApp = async(pkg) => {
        this.onlyConnected()
        const result = (
            await this.shell(`app_launcher -w -s ${pkg}`, {timeout: 15_000}) || ''
        ).trim().slice(32).split(' ')

        if (result.length < 2) {
            throw new Error('Failed launch app with web-debug')
        }

        const pid = Number(result[0])
        const port = Number(result[result.length - 1])

        return {pkg, pid, port}
    }

    killApp = async(pkg, force = false) => {
        this.onlyConnected()
        await this.shell(`app_launcher ${force ? '-k' : '-t'} ${pkg}`, {timeout: 2500})
        return true
    }

    /** @returns {Promise<Map<string, string>>} */
    getApps = async() => {
        this.onlyConnected()
        const appsRaw = await this.shell('app_launcher --list', {timeout: 5000})
        if (!appsRaw?.length) {
            return new Map()
        }

        const listRaw = appsRaw.split('=================================================')[1]
        if (!listRaw?.includes("\t'")) {
            return new Map()
        }

        const appsList = listRaw.trim().split('\n').map(pair => pair.replace(/\t'|\r|'/g, '').split('\t '))
        if (appsList[0]?.length !== 2) {
            return new Map()
        }

        return new Map(appsList)
    }

    /**
     * When connecting, we always get the message
     * "device unauthorized. Please approve on your device.",
     * even if the connection was already approved.
     *
     * So we try to connect twice (param retry, default = true)
     *
     * @param {string} host
     * @param {number} port
     * @param {boolean=} retry
     * */
    connect = async(host, port, retry = true) => {
        const serial = `${host}:${port}`
        try {
            // eslint-disable-next-line new-cap
            await this.ConnectDevice(serial)
            const devices = await this.getConnectedDevices()

            // @ts-ignore
            if (!devices.some(d => d.udid === serial)) {
                throw new Error('Error while connect devices.')
            }

            this.serial = serial
            return true
        }
        catch (err) {
            if (retry) {
                return this.connect(host, port, false)
            }
            throw err
        }
    }

    // @ts-ignore
    disconnect = () => this.onlyConnected() && this.sdbExec(['disconnect', this.serial])

    devices = () => this.onlyConnected() && this.getConnectedDevices()

    onlyConnected() {
        if (!this.serial) {
            throw new Error('SDB is not connected. Call SDBClient.connect for use.')
        }
        return true
    }
}

export default syrup.serial()
    .define((options) => new SDBClient())
