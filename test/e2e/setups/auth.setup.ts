import {test as setup} from '@playwright/test'
import { DeviceHubMockLoginPage } from '../pageObjects/mockLogin'
import { DeviceHubMainPage } from '../pageObjects/mainPage/mainPage'

const authFile = '.auth/user.json'

setup('authenticate', async({page}) => {
    const deviceHubMockLoginPage = new DeviceHubMockLoginPage(page)
    await deviceHubMockLoginPage.goto()
    await deviceHubMockLoginPage.login('user', 'user@example.com')
    const deviceHubMainPage = new DeviceHubMainPage(page)
    await deviceHubMainPage.isPageDisplayed()

    await page.context().storageState({path: authFile})
})
