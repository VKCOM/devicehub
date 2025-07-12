import { expect, test } from '@playwright/test'
import {DeviceHubDevicePage} from '../pageObjects/controlPage/devicePage'
import { freeDevice, isDeviceInUse, useDevice } from '../helpers/devicesHelper'
import { DeviceHubModalPage } from '../pageObjects/common/errorModal'
import { DeviceHubRemoteConnectCard } from '../pageObjects/controlPage/dashboard/remoteConnectCard'
import { isTcpPortOpen } from '../helpers/utils/net'

const deviceSerial = 'emulator-5554'

test.describe('Device control tests', () => {

    test.beforeEach('Use device by direct link', async ({ page }) => {
        let devicePage = new DeviceHubDevicePage(page, deviceSerial)
        await devicePage.gotoDevice(deviceSerial)
        await devicePage.isPageDisplayed()
    })

    test.afterEach('Free device after test (via api)', async() => {
        await freeDevice(deviceSerial)
    })

    test('Device screen changing when swiping', async ({ page }) => {
        let devicePage = new DeviceHubDevicePage(page, deviceSerial)
        const firstScreen = await devicePage.deviceScreen.getDeviceScreen()
        await devicePage.deviceScreen.swipeOnDeviceScreen()
        const secondScreen = await devicePage.deviceScreen.getDeviceScreen()
        expect(firstScreen).not.toBe(secondScreen)
    })

    test('Free device by button', async ({ page }) => {
        let devicePage = new DeviceHubDevicePage(page, deviceSerial)
        expect(await isDeviceInUse(deviceSerial)).toBeTruthy()
        const deviceHubMainPage = await devicePage.stopUse()
        await deviceHubMainPage.isPageDisplayed()
        expect(await isDeviceInUse(deviceSerial)).toBeFalsy()
    })

    test('Device remote connect', async ({ page }) => {
        let remoteConnectCard = new DeviceHubRemoteConnectCard(page)
        await remoteConnectCard.isPageDisplayed()
        let adbLink = await remoteConnectCard.getAdbLink()
        let adbHostAndPort = adbLink.split('adb connect')[1].split(':')
        const isOpen = await isTcpPortOpen(adbHostAndPort[0].trim(), adbHostAndPort[1].trim())
        expect(isOpen).toBe(true)
    })

})


test.describe('Device already used tests', () => {
    test('Try to use already used device by direct url', async ({ page }) => {
        await useDevice(deviceSerial)
        const modalHeader = 'Device was disconnected'
        const modalDescription = 'Unauthorized'
        await new DeviceHubDevicePage(page, deviceSerial).gotoDevice(deviceSerial)
        await new DeviceHubModalPage(page, modalHeader, modalDescription).isModalDisplayed()
    })
})
