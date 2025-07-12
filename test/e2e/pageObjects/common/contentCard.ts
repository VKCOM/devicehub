import { expect, Locator, Page } from '@playwright/test'

export class DeviceHubContentCard {
    readonly page: Page
    readonly contentCard: Locator

    constructor(page: Page, context: string) {
        this.page = page
        this.contentCard = page.locator(`li[class*="contentCard"][class*=${context}]`);
    }

    async isPageDisplayed() {
       await expect(this.contentCard).toBeVisible()
    }

}
