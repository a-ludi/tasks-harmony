import { test, expect } from '@playwright/test';
import { today, waitForApp, seedAndReload, makeChore, makeCompletion } from './helpers/idb';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await seedAndReload(page, {
    chores: [
      makeChore({
        choreId: 'walk-dog',
        title: 'Walk the dog',
        description: 'Full description visible only on the details page, not truncated.',
        recurrence: {
          frequency: 'daily',
          interval: 1,
          startDate: today(),
          windowStartTime: '00:00',
        },
      }),
    ],
    completions: [
      makeCompletion({ choreKey: 'personal/walk-dog', xpEarned: 7, streak: 1 }),
    ],
  });
});

test('clicking chore card title navigates to details page', async ({ page }) => {
  await page.getByTestId('chore-card').filter({ hasText: 'Walk the dog' }).getByRole('link', { name: 'Walk the dog' }).click();
  await expect(page).toHaveURL(/\/chores\/.+/);
  await expect(page.getByRole('heading', { level: 1, name: 'Walk the dog' })).toBeVisible();
});

test('details page shows full description without truncation', async ({ page }) => {
  await page.getByTestId('chore-card').filter({ hasText: 'Walk the dog' }).getByRole('link', { name: 'Walk the dog' }).click();
  await expect(page.getByText('Full description visible only on the details page, not truncated.')).toBeVisible();
});

test('details page shows completion history', async ({ page }) => {
  await page.getByTestId('chore-card').filter({ hasText: 'Walk the dog' }).getByRole('link', { name: 'Walk the dog' }).click();
  await expect(page.getByRole('columnheader', { name: 'Completed at' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '7' })).toBeVisible();
});

test('back button returns to previous page', async ({ page }) => {
  await page.getByTestId('chore-card').filter({ hasText: 'Walk the dog' }).getByRole('link', { name: 'Walk the dog' }).click();
  await expect(page).toHaveURL(/\/chores\/.+/);
  await page.getByRole('button', { name: /Back/ }).click();
  await expect(page).toHaveURL('/');
});
