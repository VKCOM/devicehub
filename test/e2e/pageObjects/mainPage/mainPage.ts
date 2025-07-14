import { type Locator, type Page } from '@playwright/test'
import { PageHeader } from '../pageHeader'
import { DeviceHubMainPageDevicesTable } from './mainPageDevicesTable'
import { DeviceHubMainPageSearch } from './mainPageSearch'

export class DeviceHubMainPage {
    readonly page: Page;
    readonly devicehubLogo: Locator;
    readonly pageHeader: PageHeader;

    constructor(page: Page) {
        this.page = page;
        this.devicehubLogo = page.getByTitle('DeviceHub');
        this.pageHeader = new PageHeader(this.page)
    }

    async goto() {
        await this.page.goto('/');
    }

    async gotoAsDevicesPage() {
        await this.page.goto('/#/devices')
    }

    async isPageDisplayed() {
        await this.pageHeader.isPageDisplayed()
        await new DeviceHubMainPageSearch(this.page).isPageDisplayed()
    }

    async isPageFullyDisplayedWithoutDevices() {
        await this.pageHeader.isPageFullyDisplayed()
        await new DeviceHubMainPageDevicesTable(this.page).isPageDisplayedWithoutDevices()
    }

    async isPageFullyDisplayedWithDevices() {
        await this.pageHeader.isPageFullyDisplayed()
        await new DeviceHubMainPageDevicesTable(this.page).isPageFullyDisplayedWithDevices()
    }

    async useDevice(deviceSerial: string) {
        return await new DeviceHubMainPageDevicesTable(this.page).useDevice(deviceSerial)
    }

    async checkDeviceIsBusy(deviceSerial: string) {
        await new DeviceHubMainPageDevicesTable(this.page).checkDeviceIsBusy(deviceSerial)
    }

    async openSettings() {
        return this.pageHeader.openSettings()
    }

}

