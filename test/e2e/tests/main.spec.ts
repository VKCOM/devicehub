import {test} from '@playwright/test'
import {DeviceHubMainPage} from '../pageObjects/mainPage/mainPage'
import { freeDevice, generateDevice, removeAllDevices } from '../helpers/devicesHelper'

test.describe('Main page tests', () => {
    let deviceHubMainPage: DeviceHubMainPage

    test.beforeEach('Open main page', async({page}) => {
        deviceHubMainPage = new DeviceHubMainPage(page)
        await deviceHubMainPage.goto()
    })

    test('open settings page by click in header', async({page}) => {
        const settingPage = await deviceHubMainPage.openSettings()
        await settingPage.isPageDisplayed()
    })

    test.describe('Tests with devices', () => {
        test('check that page is fully displayed with devices', async({page}) => {
            await deviceHubMainPage.isPageFullyDisplayedWithDevices()
        })

        test('check device usage from table', async({page}) => {
            const deviceSerial = 'emulator-5554'
            try {
                const deviceHubMainPage = new DeviceHubMainPage(page)

                let devicePage = await deviceHubMainPage.useDevice(deviceSerial)
                await devicePage.pageHeader.openDevicesListButton.click()

                await deviceHubMainPage.isPageDisplayed()
                await deviceHubMainPage.checkDeviceIsBusy(deviceSerial)
            }
            finally {
                await freeDevice(deviceSerial)
            }
        })
    })

    test.describe('Tests with fake devices', () => {
        test.beforeAll('Create fake device', async() => {
            await generateDevice('3')
        })

        test.afterAll('Delete all devices', async() => {
            await removeAllDevices()
        })

        test('check that page is fully displayed with devices', async({page}) => {
            const deviceHubMainPage = new DeviceHubMainPage(page)
            await deviceHubMainPage.isPageFullyDisplayedWithDevices()
        })
    })

    // This part must be in end for now
    test.describe('Tests without devices', () => {
        test.beforeAll('Delete all devices', async() => {
            await removeAllDevices()
        })

        test('check that page is fully displayed without devices', async({page}) => {
            console.log(await page.context().storageState())
            const deviceHubMainPage = new DeviceHubMainPage(page)
            await deviceHubMainPage.isPageFullyDisplayedWithoutDevices()
        })
    })

})
