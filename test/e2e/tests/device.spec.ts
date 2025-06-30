import { expect, test } from '@playwright/test'
import {DeviceHubDevicePage} from '../pageObjects/controlPage/devicePage'
import { freeDevice, useDevice } from '../helpers/devicesHelper'
import { DeviceHubErrorModalPage } from '../pageObjects/common/errorModal'

const deviceSerial = 'emulator-5554'

test.describe('Device page tests', () => {

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

test.describe('Device Already used tests', () => {
    test('Try to use already used device by direct url', async ({ page }) => {
        await useDevice(deviceSerial)
        const modalHeader = 'Device was disconnected'
        const modalDescription = 'Unauthorized'
        await new DeviceHubDevicePage(page, deviceSerial).gotoDevice(deviceSerial)
        await new DeviceHubErrorModalPage(page, modalHeader, modalDescription).isModalDisplayed()
    })
})
