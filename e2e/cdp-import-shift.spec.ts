import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers/idb';

const PACK_YAML = `
title: "Fitness Pack"
chores:
  - run.yaml
targetDate: "2027-01-01"
allowShiftOnImport: true
`.trim();

const RUN_YAML = `
title: "Run"
xpSize: S
frequency: daily
interval: 1
`.trim();

const PACK_YAML_NO_SHIFT = `
title: "Basic Pack"
chores:
  - run.yaml
`.trim();

const PACK_YAML_NO_DATE = `
title: "No Date Pack"
chores:
  - run.yaml
allowShiftOnImport: true
`.trim();

const PACK_URL = 'https://example.com/packs/fitness';
const PACK_URL_NO_DATE = 'https://example.com/packs/nodatepack';

async function openImportDialog(page: Parameters<typeof waitForApp>[0]) {
  await page.getByRole('button', { name: 'Pack actions' }).click();
  await page.getByRole('menuitem', { name: 'Import Pack' }).click({ force: true });
}

async function routeMockPack(
  page: Parameters<typeof waitForApp>[0],
  packYaml: string,
) {
  await page.route('https://example.com/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('/__pack__.yaml')) {
      return route.fulfill({ status: 200, contentType: 'text/plain', body: packYaml });
    }
    if (url.endsWith('/run.yaml')) {
      return route.fulfill({ status: 200, contentType: 'text/plain', body: RUN_YAML });
    }
    return route.abort();
  });
}

test.describe('CDP import date-shift prompt', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
  });

  test('shows date-shift step when pack has allowShiftOnImport: true', async ({ page }) => {
    await routeMockPack(page, PACK_YAML);
    await openImportDialog(page);

    await page.getByLabel('Pack base URL').fill(PACK_URL);
    await page.getByRole('button', { name: 'Import pack' }).click();

    await expect(page.getByLabel('Start date')).toBeVisible();
    await expect(page.getByLabel('Target date')).toBeVisible();
    await expect(page.getByText(/Duration:/)).toBeVisible();
  });

  test('confirms import with shifted dates', async ({ page }) => {
    await routeMockPack(page, PACK_YAML);
    await openImportDialog(page);

    await page.getByLabel('Pack base URL').fill(PACK_URL);
    await page.getByRole('button', { name: 'Import pack' }).click();

    await expect(page.getByLabel('Start date')).toBeVisible();
    await page.getByRole('button', { name: 'Import with these dates' }).click();

    await expect(page).toHaveURL(/\/packs\/fitness/);
  });

  test('Back button returns to URL entry', async ({ page }) => {
    await routeMockPack(page, PACK_YAML);
    await openImportDialog(page);

    await page.getByLabel('Pack base URL').fill(PACK_URL);
    await page.getByRole('button', { name: 'Import pack' }).click();

    await expect(page.getByLabel('Start date')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();

    await expect(page.getByLabel('Pack base URL')).toBeVisible();
    await expect(page.getByLabel('Start date')).not.toBeVisible();
    await expect(page.getByLabel('Target date')).not.toBeVisible();
  });

  test('shows date-shift step when only allowShiftOnImport is true (no targetDate)', async ({ page }) => {
    await routeMockPack(page, PACK_YAML_NO_DATE);
    await openImportDialog(page);

    await page.getByLabel('Pack base URL').fill(PACK_URL_NO_DATE);
    await page.getByRole('button', { name: 'Import pack' }).click();

    await expect(page.getByLabel('Start date')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import with these dates' })).toBeVisible();
    await expect(page.getByLabel('Target date')).not.toBeVisible();
  });

  test('skips date-shift when allowShiftOnImport is absent', async ({ page }) => {
    await routeMockPack(page, PACK_YAML_NO_SHIFT);
    await openImportDialog(page);

    await page.getByLabel('Pack base URL').fill(PACK_URL);
    await page.getByRole('button', { name: 'Import pack' }).click();

    // Should navigate to the pack page directly, no date inputs
    await expect(page).toHaveURL(/\/packs\/fitness/, { timeout: 10_000 });
    await expect(page.getByLabel('Start date')).not.toBeVisible();
  });
});
