import { type Locator, type Page } from '@playwright/test'
import { MainPageHeader } from './mainPageHeader'
import { DeviceHubMainPageDevicesTable } from './mainPageDevicesTable'

export class DeviceHubMainPage {
    readonly page: Page;
    readonly devicehubLogo: Locator;

    constructor(page: Page) {
        this.page = page;
        this.devicehubLogo = page.getByTitle('DeviceHub');
    }

    async isPageDisplayed() {
        await new MainPageHeader(this.page).isPageDisplayed()
    }

    async isPageFullyDisplayedWithoutDevices() {
        await new DeviceHubMainPageDevicesTable(this.page).isPageDisplayedWithoutDevices()
    }

    async isPageFullyDisplayedWithDevices() {
        await new MainPageHeader(this.page).isPageFullyDisplayed()
        await new DeviceHubMainPageDevicesTable(this.page).isPageFullyDisplayedWithDevices()
    }

}

