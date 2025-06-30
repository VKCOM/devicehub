import { expect, Locator, Page } from '@playwright/test'
import { DeviceHubDeviceScreenPage } from './DeviceScreen'
import { PageHeader } from '../pageHeader'
import playwrightConfig from '../../playwright.config'

export class DeviceHubDevicePage {
    readonly page: Page
    readonly deviceSerial: string
    readonly pageHeader: PageHeader
    readonly baseUrl = playwrightConfig?.use?.baseURL
    readonly deviceScreen: DeviceHubDeviceScreenPage

    constructor(page: Page, deviceSerial: string) {
        this.page = page
        this.deviceSerial = deviceSerial
        this.pageHeader = new PageHeader(this.page)
        this.deviceScreen = new DeviceHubDeviceScreenPage(this.page)
    }

    async gotoDevice(deviceSerial: string) {
        await this.page.goto(`/#/control/${deviceSerial}`)
    }

    async isPageDisplayed() {
        expect(this.page.url()).toBe(`${this.baseUrl}/#/control/${this.deviceSerial}`)
        await this.pageHeader.isPageDisplayed()
        await this.deviceScreen.isPageDisplayed()
    }

    async isErrorModalDisplayed() {
        expect(this.page.url()).toBe(`${this.baseUrl}/#/control/${this.deviceSerial}`)
        
    }

}
