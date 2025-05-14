import {test} from '@playwright/test'
import {DeviceHubMainPage} from '../pageObjects/mainPage'
import {DeviceHubMockLoginPage} from '../pageObjects/mockLogin'
import {generateDevice, removeAllDevices} from '../helpers/devicesHelper'

test.describe('Tests without devices', () => {
    test.beforeEach('Login as user', async({page}) => {
        const deviceHubMockLoginPage = new DeviceHubMockLoginPage(page)
        await deviceHubMockLoginPage.goto()
        await deviceHubMockLoginPage.login('user', 'user@example.com')
    })

    test.beforeEach('Delete all devices', async() => {
        await removeAllDevices()
    })

    test('check that page is fully displayed without devices', async({page}) => {
        const deviceHubMainPage = new DeviceHubMainPage(page)
        await deviceHubMainPage.isPageFullyDisplayedWithoutDevices()
    })
})

test.describe('Tests with devices', () => {
    test.beforeEach('Login as user', async({page}) => {
        const deviceHubMockLoginPage = new DeviceHubMockLoginPage(page)
        await deviceHubMockLoginPage.goto()
        await deviceHubMockLoginPage.login('user', 'user@example.com')
    })

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
