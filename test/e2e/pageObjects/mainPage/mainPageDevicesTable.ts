import { expect, Locator, Page } from '@playwright/test'

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
        await expect(this.devicesRows.nth(1)).toBeVisible()
    }

}
