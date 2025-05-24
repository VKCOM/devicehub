import { expect, Locator, Page } from '@playwright/test'
import { DeviceHubDevicePage } from '../controlPage/devicePage'

export class DeviceHubMainPageDevicesTable {
    readonly page: Page
    readonly devicesCounter: Locator
    readonly nothingPlaceholder: Locator
    readonly devicesRows: Locator

    constructor(page: Page) {
        this.page = page
        this.devicesCounter = page.locator('#devicesListCounter')
        this.nothingPlaceholder = page.getByText('No devices connected')
        this.devicesRows = page.locator('#deviceTableRow')
    }

    async isPageDisplayed() {
        await expect(this.devicesCounter).toBeVisible()
    }

    async isPageDisplayedWithoutDevices() {
        await this.isPageDisplayed()
        await expect(this.nothingPlaceholder).toBeVisible()
        await expect(this.devicesCounter).toContainText('0')
        await expect(this.devicesRows).toBeHidden()
    }

    async isPageFullyDisplayedWithDevices() {
        await this.isPageDisplayed()
        await expect(this.devicesRows.nth(0)).toBeVisible()
    }

    async useDevice(deviceSerial: string) {
        let devicePage = new DeviceHubDevicePage(this.page, deviceSerial)
        await this.devicesRows.locator(`a[href="#/control/${deviceSerial}"]:has(button:has-text("Use"))`).click();
        await devicePage.isPageDisplayed()
        return devicePage
    }

    async checkDeviceIsBusy(deviceSerial: string) {
        await expect(this.page.locator(`#stopUsing_${deviceSerial}`)).toBeVisible();
    }

}
