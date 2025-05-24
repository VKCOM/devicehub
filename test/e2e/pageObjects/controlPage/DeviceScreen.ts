import { expect, Locator, Page } from '@playwright/test'

export class DeviceHubDeviceScreenPage {
    readonly page: Page
    readonly deviceTopBar: Locator
    readonly deviceName: Locator
    readonly portraitButton: Locator
    readonly landscapeButton: Locator
    readonly qualityButton: Locator
    readonly stopButton: Locator
    readonly deviceScreen: Locator
    readonly menuButton: Locator
    readonly homeButton: Locator
    readonly appSwitchButton: Locator
    readonly backButton: Locator

    constructor(page: Page, ) {
        this.page = page
        this.deviceTopBar = page.locator('#deviceTopBar')
        this.deviceName = page.locator('#deviceName')
        this.portraitButton = page.locator('button[title*="Portrait"]');
        this.landscapeButton = page.locator('button[title*="Landscape"]');
        this.qualityButton = page.locator('button[class*="qualityButton"]');
        this.stopButton = page.locator('button[title*="Stop Using"]');
        this.deviceScreen = page.locator('div[class*="deviceScreen"]');
        this.menuButton = page.locator('button[title*="Menu"]');
        this.homeButton = page.locator('button[title*="Home"]');
        this.appSwitchButton = page.locator('button[title*="App switch"]');
        this.backButton = page.locator('button[title*="Back"]');
    }

    async isPageDisplayed() {
        await expect(this.deviceTopBar).toBeVisible()
        await expect(this.deviceName).toBeVisible()
        await expect(this.portraitButton).toBeVisible()
        await expect(this.landscapeButton).toBeVisible()
        await expect(this.qualityButton).toBeVisible()
        await expect(this.stopButton).toBeVisible()
        await expect(this.deviceScreen).toBeVisible()
    }

}
