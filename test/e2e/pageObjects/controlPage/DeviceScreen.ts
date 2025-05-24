import { expect, Locator, Page } from '@playwright/test'
import { getCanvasImageData } from '../../helpers/utils/canvas'

export class DeviceHubDeviceScreenPage {
    readonly page: Page
    readonly deviceTopBar: Locator
    readonly deviceName: Locator
    readonly portraitButton: Locator
    readonly landscapeButton: Locator
    readonly qualityButton: Locator
    readonly stopButton: Locator
    readonly deviceScreen: Locator
    readonly deviceCanvas: Locator
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
        this.deviceCanvas = page.locator('canvas[class*="_canvas_"]');
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
        await expect(this.deviceCanvas).toBeVisible()
    }

    async getDeviceScreen() {
        await this.page.waitForTimeout(2000)
        return await getCanvasImageData(this.page, this.deviceCanvas)
    }

    async swipeOnDeviceScreen() {
        const canvas = await this.deviceCanvas.boundingBox()
        if (!canvas) throw new Error('Canvas not visible');

        const startX = canvas.x + canvas.width / 4;
        const startY = canvas.y + canvas.height / 2;
        const endX = canvas.x + (canvas.width * 3) / 4;
        const endY = startY;

        await this.page.mouse.move(startX, startY);
        await this.page.mouse.down();
        await this.page.mouse.move(endX, endY, { steps: 10 });
        await this.page.mouse.up();
    }

}
