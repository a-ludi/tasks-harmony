import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';

test('sidebar footer shows the current app version', async ({ page }) => {
  const { version } = JSON.parse(readFileSync('package.json', 'utf-8'));

  await page.goto('/');
  await page.waitForSelector('nav', { state: 'visible' });

  const footer = page.locator('nav footer');
  await expect(footer).toContainText(`v${version}`);
});
