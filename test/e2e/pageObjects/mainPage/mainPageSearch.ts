import { expect, Locator, Page } from '@playwright/test'

export class DeviceHubMainPageSearch {
    readonly page: Page
    readonly searchInput: Locator

    constructor(page: Page) {
        this.page = page
        this.searchInput = page.getByPlaceholder('Device search')
    }

    async isPageDisplayed() {
        await expect(this.searchInput).toBeVisible()
    }

    async inputQuery(query: string) {
        await this.searchInput.fill(query)
    }
}
