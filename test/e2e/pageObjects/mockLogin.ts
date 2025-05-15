import { expect, type Locator, type Page } from '@playwright/test';

export class DeviceHubMockLoginPage {
    readonly page: Page;
    readonly devicehubLogo: Locator;
    readonly loginInput: Locator;
    readonly emailInput: Locator;
    readonly loginButton: Locator;
    readonly contactButton: Locator;

    constructor(page: Page) {
        this.page = page;
        this.loginInput = page.getByPlaceholder('Please enter your name');
        this.emailInput = page.getByPlaceholder('Please enter your email');
        this.devicehubLogo = page.getByTitle('DeviceHub');
        this.loginButton = page.locator('#loginButton');
        this.contactButton = page.locator('#contactButton');
    }

    async goto() {
        await this.page.goto('/auth');
    }

    async isPageDisplayed() {
        await expect(this.devicehubLogo).toBeVisible()
        await expect(this.loginInput).toBeVisible()
        await expect(this.emailInput).toBeVisible()
        await expect(this.loginButton).toBeVisible()
        await expect(this.loginButton).toBeDisabled()
        await expect(this.contactButton).toBeVisible()
    }

    async login(login: string, email: string) {
        await this.loginInput.fill(login)
        await this.emailInput.fill(email)
        await this.loginButton.click()
    }
}
