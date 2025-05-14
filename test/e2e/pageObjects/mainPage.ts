import { expect, type Locator, type Page } from '@playwright/test';

export class DeviceHubMainPage {
    readonly page: Page;
    readonly devicehubLogo: Locator;

    constructor(page: Page) {
        this.page = page;
        this.devicehubLogo = page.getByTitle('DeviceHub');
    }

    async isPageDisplayed() {
        await new DeviceHubMainPageHeader(this.page).isPageDisplayed()
    }

    async isPageFullyDisplayedWithoutDevices() {
        await new DeviceHubMainPageDevicesTable(this.page).isPageDisplayedWithoutDevices()
    }

    async isPageFullyDisplayedWithDevices() {
        await new DeviceHubMainPageHeader(this.page).isPageFullyDisplayed()
        await new DeviceHubMainPageDevicesTable(this.page).isPageFullyDisplayedWithDevices()
    }

}

class DeviceHubMainPageHeader {
    readonly page: Page;
    readonly baseHeader: Locator;
    readonly deviceHubLogo: Locator;
    readonly openDevicesListButton: Locator;
    readonly openSettingsButton: Locator;
    readonly ContactSupportButton: Locator;
    readonly HelpButton: Locator;
    readonly LogoutButton: Locator;

    constructor(page: Page) {
        this.page = page;
        this.baseHeader = page.locator('#mainPageHeader');
        this.deviceHubLogo = page.getByTitle('DeviceHub');
        this.openDevicesListButton = page.getByRole('button', { name: 'Devices', exact: true })
        this.openSettingsButton = page.getByText('Settings')
        this.ContactSupportButton = page.getByText('DeviceHub Support');
        this.HelpButton = page.getByText('Help');
        this.LogoutButton = page.getByText('Logout');
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

class DeviceHubMainPageDevicesTable {
    readonly page: Page;
    readonly devicesCounter: Locator;
    readonly nothingPlaceholder: Locator;
    readonly devicesRows: Locator;

    constructor(page: Page) {
        this.page = page;
        this.devicesCounter = page.locator('#devicesListCounter');
        this.nothingPlaceholder = page.getByText('No devices connected');
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
        await expect(this.devicesRows.nth(1)).toBeVisible()
    }

}
