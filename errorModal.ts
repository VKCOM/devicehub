import { expect, Locator, Page } from '@playwright/test'
import { PageHeader } from '../pageHeader'
import playwrightConfig from '../../playwright.config'

export class DeviceHubErrorModalPage {
    readonly page: Page
    readonly pageHeader: PageHeader
    readonly baseUrl = playwrightConfig?.use?.baseURL
    readonly title: Locator
    readonly description: Locator

    constructor(page: Page, headerText: string, descriptionText: string) {
        this.page = page
        this.pageHeader = new PageHeader(this.page)
        this.title = page.getByText(headerText)
        this.description = page.getByText(descriptionText)

    }

    async isModalDisplayed() {
        await expect(this.title).toBeVisible()
        await expect(this.description).toBeVisible()
    }

}
