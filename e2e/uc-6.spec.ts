import { test, expect } from '@playwright/test';
import { waitForApp, seedDatabase, makeCompletion } from './helpers/idb';

const PROFILE = {
  id: 'me',
  displayName: 'Alice',
  email: 'alice@example.com',
  activeXPSettingsId: 'standard',
};

const XP_STANDARD = {
  id: 'standard',
  name: 'Standard',
  maxStreakMultiplier: 2.5,
  decayFloor: 0.6,
  streakHalfLife: 7,
  decayHalfLife: 56,
};

const XP_HARD = {
  id: 'hard',
  name: 'Hard Mode',
  maxStreakMultiplier: 2.5,
  decayFloor: 0.4,
  streakHalfLife: 14,
  decayHalfLife: 56,
};

async function seedProfile(page: import('@playwright/test').Page) {
  await page.goto('/');
  await waitForApp(page);
  await seedDatabase(page, {
    profile: [PROFILE],
    xpSettings: [XP_STANDARD, XP_HARD],
    completions: [makeCompletion({ choreKey: 'personal/a', xpEarned: 240 })],
  });
  await page.goto('/profile');
  await waitForApp(page);
}

test('Profile page shows required stats', async ({ page }) => {
  await seedProfile(page);

  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await expect(page.locator('#displayName')).toHaveValue('Alice');
  await expect(page.getByText('240', { exact: true })).toBeVisible();
  // Active formula label shows "Standard"
  await expect(page.locator('p').filter({ hasText: 'Active formula' })).toContainText('Standard');
});

test('Update display name successfully', async ({ page }) => {
  await seedProfile(page);

  await page.getByLabel('Display Name').fill('Alice B.');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Changes saved');
  await expect(page.locator('#displayName')).toHaveValue('Alice B.');
});

test('Success alert can be dismissed', async ({ page }) => {
  await seedProfile(page);

  await page.getByLabel('Display Name').fill('Alice B.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByRole('alert')).not.toBeVisible();
});

test('Invalid email is rejected', async ({ page }) => {
  await seedProfile(page);

  await page.getByLabel('Email').fill('not-an-email');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByText('Please enter a valid email address')).toBeVisible();
  await expect(page.locator('#email')).toHaveValue('not-an-email');
  // Success alert should NOT appear
  await expect(page.getByRole('alert')).not.toBeVisible();
});

test('Valid email is accepted', async ({ page }) => {
  await seedProfile(page);

  await page.getByLabel('Email').fill('alice.b@example.com');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('#email')).toHaveValue('alice.b@example.com');
});

test('Switch XP configuration', async ({ page }) => {
  await seedProfile(page);

  await page.getByLabel('XP Formula').selectOption('hard');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  // Active formula paragraph shows "Hard Mode"
  await expect(page.locator('p').filter({ hasText: 'Active formula' })).toContainText('Hard Mode');
});
