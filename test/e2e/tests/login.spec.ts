import {test} from '@playwright/test'
import {DeviceHubMockLoginPage} from '../pageObjects/mockLogin'
import {DeviceHubMainPage} from '../pageObjects/mainPage/mainPage'

test('check mock auth page is displayed', async({page}) => {
    const deviceHubMockLoginPage = new DeviceHubMockLoginPage(page)
    await deviceHubMockLoginPage.goto()
    await deviceHubMockLoginPage.isPageDisplayed()
})

test('login with mock auth and check main page displayed', async({page}) => {
    const deviceHubMockLoginPage = new DeviceHubMockLoginPage(page)
    await deviceHubMockLoginPage.goto()
    await deviceHubMockLoginPage.login('user', 'user@example.com')
    const deviceHubMainPage = new DeviceHubMainPage(page)
    await deviceHubMainPage.isPageDisplayed()
})
