import {execShellCommand} from './utils/shell'
import { generateToken } from './utils/generateToken'

export async function generateDevice(number: string) {
    await execShellCommand('stf generate-fake-device fake-device-type --number ' + number)
}

export async function generateDeviceWithName(name: string, number: string) {
    await execShellCommand('stf generate-fake-device ' + name + ' --number ' + number)
}

export async function removeAllDevices() {
    const baseUrl = 'http://localhost:7100/api/v1';

    const token = await generateToken()
    let devicesResp = await fetch(baseUrl + '/devices', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
        }
    });
    let devicesJson = await devicesResp.json()
    if (devicesJson.devices.length > 0) {
        for (const device of devicesJson.devices) {
            let deviceDeleteResp = await fetch(baseUrl + '/devices/' + device.serial, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                }
            });
            console.log(await deviceDeleteResp.json())
        }
    } else {
        console.log('No devices were found')
    }
}
