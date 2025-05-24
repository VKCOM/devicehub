import { expect, test } from '@playwright/test'
import {DeviceHubMockLoginPage} from '../pageObjects/mockLogin'
import {DeviceHubMainPage} from '../pageObjects/mainPage/mainPage'
import {DeviceHubDevicePage} from '../pageObjects/controlPage/devicePage'
import { freeDevice } from '../helpers/devicesHelper'

test.describe('Device page tests', () => {
    const deviceSerial = 'emulator-5554'
    test.beforeEach('Login as user', async ({ page }) => {

        const deviceHubMockLoginPage = new DeviceHubMockLoginPage(page)
        await deviceHubMockLoginPage.goto()
        await deviceHubMockLoginPage.login('user', 'user@example.com')
        const deviceHubMainPage = new DeviceHubMainPage(page)
        await deviceHubMainPage.useDevice(deviceSerial)

    })

    test.afterEach('Login as user', async ({ page }) => {
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
