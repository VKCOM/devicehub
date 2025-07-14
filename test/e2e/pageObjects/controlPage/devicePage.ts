import { expect, Page } from '@playwright/test'
import { DeviceHubDeviceScreenPage } from './DeviceScreen'
import { PageHeader } from '../pageHeader'
import playwrightConfig from '../../playwright.config'
import { DeviceHubModalPage } from '../common/errorModal'
import { DeviceHubMainPage } from '../mainPage/mainPage'

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

    async stopUse(){
        await this.deviceScreen.stopUse()
        const modalHeader = 'Warning'
        const modalDescription = 'Are you sure you want to release the device? The device will be cleared before returning to the device list'
        const modal = await new DeviceHubModalPage(this.page, modalHeader, modalDescription).isModalDisplayed()
        await modal.pressOK()
        return new DeviceHubMainPage(this.page)
    }

}
