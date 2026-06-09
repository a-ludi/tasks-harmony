import { test, expect } from '@playwright/test';
import { today, waitForApp, seedAndReload, makeChore } from './helpers/idb';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  await seedAndReload(page, {
    chores: [
      makeChore({ choreId: 'floss-teeth', title: 'Floss teeth', xpSize: 'S',
        recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' } }),
      makeChore({ choreId: 'take-vitamins', title: 'Take vitamins', xpSize: 'XS',
        recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' } }),
    ],
  });
});

test('edit form opens pre-populated', async ({ page }) => {
  const card = page.getByTestId('chore-card').filter({ hasText: 'Floss teeth' });
  await card.getByRole('button', { name: 'Chore actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();

  await expect(page.getByLabel('Title')).toHaveValue('Floss teeth');
  await expect(page.getByLabel('XP Size')).toContainText('S (5 XP)');
  await expect(page.getByLabel('Frequency')).toContainText('Daily');
  await expect(page.getByLabel('Interval')).toHaveValue('1');
});

test('save edited chore updates the card', async ({ page }) => {
  const card = page.getByTestId('chore-card').filter({ hasText: 'Floss teeth' });
  await card.getByRole('button', { name: 'Chore actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();

  await page.getByLabel('Title').fill('Floss & rinse');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect(page.getByTestId('chore-card').filter({ hasText: 'Floss & rinse' })).toBeVisible();
  await expect(page.getByTestId('chore-card').filter({ hasText: 'Floss teeth' })).not.toBeVisible();
});

test('validation errors block save', async ({ page }) => {
  const card = page.getByTestId('chore-card').filter({ hasText: 'Floss teeth' });
  await card.getByRole('button', { name: 'Chore actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();

  await page.getByLabel('Title').fill('');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect(page.getByText('Title is required.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Edit Chore' })).toBeVisible();
});

test('deactivate a chore removes it from dashboard', async ({ page }) => {
  const card = page.getByTestId('chore-card').filter({ hasText: 'Take vitamins' });

  page.on('dialog', (dialog) => dialog.accept());
  await card.getByRole('button', { name: 'Chore actions' }).click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();

  await expect(page.getByTestId('chore-card').filter({ hasText: 'Take vitamins' })).not.toBeVisible();
  await expect(page.getByTestId('chore-card').filter({ hasText: 'Floss teeth' })).toBeVisible();
});
