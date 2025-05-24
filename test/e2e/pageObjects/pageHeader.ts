import { expect, Locator, Page } from '@playwright/test'

export class PageHeader {
    readonly page: Page
    readonly baseHeader: Locator
    readonly deviceHubLogo: Locator
    readonly openDevicesListButton: Locator
    readonly openSettingsButton: Locator
    readonly ContactSupportButton: Locator
    readonly HelpButton: Locator
    readonly LogoutButton: Locator

    constructor(page: Page) {
        this.page = page
        this.baseHeader = page.locator('#mainPageHeader')
        this.deviceHubLogo = page.getByTitle('DeviceHub')
        this.openDevicesListButton = page.getByRole('button', { name: 'Devices', exact: true })
        this.openSettingsButton = page.getByText('Settings')
        this.ContactSupportButton = page.getByText('DeviceHub Support')
        this.HelpButton = page.getByText('Help')
        this.LogoutButton = page.getByText('Logout')
    }

    async isPageDisplayed() {
        await expect(this.baseHeader).toBeVisible()
    }

    async isPageFullyDisplayed() {
        await this.isPageDisplayed()
        await expect(this.deviceHubLogo).toBeVisible()
        await expect(this.openDevicesListButton).toBeVisible()
        await expect(this.openSettingsButton).toBeVisible()
        await expect(this.ContactSupportButton).toBeVisible()
        await expect(this.HelpButton).toBeVisible()
        await expect(this.LogoutButton).toBeVisible()

    }

}
