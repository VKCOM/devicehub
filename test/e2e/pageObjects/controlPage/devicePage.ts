import { expect, Locator, Page } from '@playwright/test'
import { DeviceHubDeviceScreenPage } from './DeviceScreen'
import { PageHeader } from '../pageHeader'
import playwrightConfig from '../../playwright.config'

export class DeviceHubDevicePage {
    readonly page: Page
    readonly deviceSerial: string
    readonly pageHeader: PageHeader
    readonly baseUrl = playwrightConfig?.use?.baseURL

    constructor(page: Page, deviceSerial: string) {
        this.page = page
        this.deviceSerial = deviceSerial
        this.pageHeader = new PageHeader(this.page)
    }

    async isPageDisplayed() {
        expect(this.page.url()).toBe(`${this.baseUrl}/#/control/${this.deviceSerial}`)
        await this.pageHeader.isPageDisplayed()
        await new DeviceHubDeviceScreenPage(this.page).isPageDisplayed()
    }

}
