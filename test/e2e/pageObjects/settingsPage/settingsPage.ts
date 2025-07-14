import { expect, type Locator, type Page } from '@playwright/test'
import { PageHeader } from '../pageHeader'

export class DeviceHubSettingsPage {
    readonly page: Page;
    readonly pageHeader: PageHeader;

    // Tab navigation
    readonly generalTab: Locator;
    readonly keysTab: Locator;
    readonly groupsTab: Locator;
    readonly devicesTab: Locator;
    readonly usersTab: Locator;
    readonly shellTab: Locator;

    // General tab elements
    readonly languageSelect: Locator;
    readonly themeSelect: Locator;
    readonly dateFormatInput: Locator;
    readonly emailSeparatorInput: Locator;
    readonly resetSettingsButton: Locator;

    // Admin-only elements
    readonly alertMessageInput: Locator;
    readonly alertActivationToggle: Locator;
    readonly alertLevelSelect: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageHeader = new PageHeader(page);

        // Tab navigation
        this.generalTab = page.getByRole('tab', { name: 'General' });
        this.keysTab = page.getByRole('tab', { name: 'Keys' });
        this.groupsTab = page.getByRole('tab', { name: 'Groups' });
        this.devicesTab = page.getByRole('tab', { name: 'Devices' });
        this.usersTab = page.getByRole('tab', { name: 'Users' });
        this.shellTab = page.getByRole('tab', { name: 'Shell' });

        // General tab form elements
        this.languageSelect = page.locator('[data-testid="language-select"]');
        this.themeSelect = page.locator('[data-testid="theme-select"]');
        this.dateFormatInput = page.getByPlaceholder('e.g. M/d/yy h:mm:ss a');
        this.emailSeparatorInput = page.getByPlaceholder('e.g. ,');
        this.resetSettingsButton = page.getByRole('button', { name: 'Reset Settings' });

        // Admin elements
        this.alertMessageInput = page.locator('[data-testid="alert-message-input"]');
        this.alertActivationToggle = page.locator('[data-testid="alert-activation-toggle"]');
        this.alertLevelSelect = page.locator('[data-testid="alert-level-select"]');
    }

    async goto() {
        await this.page.goto('/#/settings');
    }

    async gotoTab(tab: 'general' | 'keys' | 'groups' | 'devices' | 'users' | 'shell') {
        await this.page.goto(`/#/settings/${tab === 'general' ? '' : tab}`);
    }

    async isPageDisplayed() {
        await this.pageHeader.isPageDisplayed();
        await expect(this.generalTab).toBeVisible();
    }

    async isGeneralTabDisplayedForUser() {
        await expect(this.languageSelect).toBeVisible();
        await expect(this.themeSelect).toBeVisible();
        await expect(this.dateFormatInput).toBeVisible();
        await expect(this.emailSeparatorInput).toBeVisible();
        await expect(this.alertMessageInput).not.toBeVisible()
        await expect(this.alertLevelSelect).not.toBeVisible()
        await expect(this.alertActivationToggle).not.toBeVisible()
    }

    async updateDateFormat(format: string) {
        await this.dateFormatInput.fill(format);
    }

    async updateEmailSeparator(separator: string) {
        await this.emailSeparatorInput.fill(separator);
    }

    async clickTab(tabName: string) {
        const tab = this.page.getByRole('tab', { name: tabName });
        await tab.click();
    }
}
