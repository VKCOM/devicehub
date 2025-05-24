import { Locator, Page } from '@playwright/test'

export async function getCanvasImageData(page: Page, locator: Locator): Promise<string> {
    return await locator.evaluate((canvas: HTMLCanvasElement) => {
        return canvas.toDataURL(); // Возвращает base64 строку
    });
}
