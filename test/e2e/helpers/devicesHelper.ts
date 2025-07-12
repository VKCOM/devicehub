import { generateAdminToken } from './tokensHelper'
import playwrightConfig from '../playwright.config';

const baseUrl = playwrightConfig?.use?.baseURL

export async function generateDevice(number: string) {
    const token = await generateAdminToken()
    let devicesResp = await fetch(`${baseUrl}/api/v1/devices/fake?number=${number}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
        }
    });
    console.log(await devicesResp.json())
}

export async function removeAllDevices() {
    const token = await generateAdminToken()
    let devicesResp = await fetch(`${baseUrl}/api/v1/devices`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
        }
    });
    let devicesJson = await devicesResp.json()
    if (devicesJson.devices.length > 0) {
        for (const device of devicesJson.devices) {
            let deviceDeleteResp = await fetch(`${baseUrl}/api/v1/devices/${device.serial}`, {
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

export async function freeDevice(serial: string) {
    const token = await generateAdminToken()
    let devicesResp = await fetch(`${baseUrl}/api/v1/user/devices/${serial}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`,
        }
    });
    console.log(await devicesResp.json())
}

export async function useDevice(serial: string, timeout?: number) {
    const token = await generateAdminToken()
    const response = await fetch(`${baseUrl}/api/v1/user/devices`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            serial,
            ...(timeout && { timeout })
        })
    })

    console.log(await response.json())
}


export async function isDeviceInUse(serial: string): Promise<boolean> {
    const token = await generateAdminToken()
    const response = await fetch(`${baseUrl}/api/v1/devices/${serial}?fields=using,owner,present,ready`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
        }
    });

    if (!response.ok) {
        console.error(`Failed to get device ${serial}: ${response.status}`)
        return false
    }

    const deviceData = await response.json()
    const device = deviceData.device

    // Device is not in use if it's not being used and has no owner
    return device.using && device.owner && device.present && device.ready
}
