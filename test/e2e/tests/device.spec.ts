import { expect, test } from '@playwright/test'
import {DeviceHubDevicePage} from '../pageObjects/controlPage/devicePage'
import { freeDevice } from '../helpers/devicesHelper'

test.describe('Device page tests', () => {
    const deviceSerial = 'emulator-5554'

    test.beforeEach('Open main page and use device', async ({ page }) => {
        await new DeviceHubDevicePage(page, deviceSerial).gotoDevice(deviceSerial)

    })

    test.afterEach('free device after test', async ({ page }) => {
        await freeDevice(deviceSerial)
    })

    test('Test device screen changing when swiping', async ({ page }) => {
        let devicePage = new DeviceHubDevicePage(page, deviceSerial)
        const firstScreen = await devicePage.deviceScreen.getDeviceScreen()
        await devicePage.deviceScreen.swipeOnDeviceScreen()
        const secondScreen = await devicePage.deviceScreen.getDeviceScreen()
        expect(firstScreen).not.toBe(secondScreen)
    })
})
