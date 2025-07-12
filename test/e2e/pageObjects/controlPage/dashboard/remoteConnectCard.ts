import { expect, Locator, Page } from '@playwright/test'
import { DeviceHubContentCard } from '../../common/contentCard'
import { notEqual } from 'node:assert'

export class DeviceHubRemoteConnectCard {
    readonly page: Page
    readonly contentCard: DeviceHubContentCard
    readonly adbLink: Locator

    constructor(page: Page) {
        this.page = page
        this.contentCard = new DeviceHubContentCard(this.page, 'remoteDebug')
        this.adbLink = page.getByText('adb connect')
    }

    async isPageDisplayed() {
        await this.contentCard.isPageDisplayed()
        expect(this.adbLink.isVisible())
    }

    async getAdbLink() {
        const adbLink = await this.adbLink.textContent()
        if (adbLink !== null) {
            return adbLink
        }
        else {
            throw new Error('No adb link found')
        }
    }

}
