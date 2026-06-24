import { test, expect } from '@playwright/test';
import { today, waitForApp, clearAndReload, makeChore } from './helpers/idb';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  await clearAndReload(page, {
    chores: [
      makeChore({ choreId: 'active-chore', title: 'Active chore',
        recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' },
        active: true }),
      makeChore({ choreId: 'archived-chore', title: 'Archived chore',
        recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' },
        active: false }),
    ],
  });
});

test('archived chores are hidden in normal mode', async ({ page }) => {
  await expect(page.getByTestId('chore-card').filter({ hasText: 'Active chore' })).toBeVisible();
  await expect(page.getByTestId('chore-card').filter({ hasText: 'Archived chore' })).not.toBeVisible();
});

test('archive mode shows archived chores and hides active ones', async ({ page }) => {
  await page.getByRole('button', { name: /Toggle compact view|Exit compact view/ }).click();
  await page.getByRole('menuitem', { name: 'View archived' }).click();

  await expect(page.getByTestId('chore-card').filter({ hasText: 'Archived chore' })).toBeVisible();
  await expect(page.getByTestId('chore-card').filter({ hasText: 'Active chore' })).not.toBeVisible();
});

test('exiting archive mode returns to normal view', async ({ page }) => {
  await page.getByRole('button', { name: /Toggle compact view|Exit compact view/ }).click();
  await page.getByRole('menuitem', { name: 'View archived' }).click();
  await page.getByRole('button', { name: /Toggle compact view|Exit compact view/ }).click();
  await page.getByRole('menuitem', { name: 'Exit archive' }).click();

  await expect(page.getByTestId('chore-card').filter({ hasText: 'Active chore' })).toBeVisible();
  await expect(page.getByTestId('chore-card').filter({ hasText: 'Archived chore' })).not.toBeVisible();
});

test('empty state shows "No archived chores." when archive mode is on and no archived chores exist', async ({ page }) => {
  await clearAndReload(page, {
    chores: [
      makeChore({ choreId: 'only-active', title: 'Only active',
        recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' },
        active: true }),
    ],
  });

  await page.getByRole('button', { name: /Toggle compact view|Exit compact view/ }).click();
  await page.getByRole('menuitem', { name: 'View archived' }).click();

  await expect(page.getByText('No archived chores.')).toBeVisible();
});

test('archive mode persists across page reload', async ({ page }) => {
  // Enter archive mode
  await page.getByRole('button', { name: /Toggle compact view|Exit compact view/ }).click();
  await page.getByRole('menuitem', { name: 'View archived' }).click();
  await expect(page.getByTestId('chore-card').filter({ hasText: 'Archived chore' })).toBeVisible();

  // Reload and verify archive mode is still active
  await page.reload();
  await waitForApp(page);
  await expect(page.getByTestId('chore-card').filter({ hasText: 'Archived chore' })).toBeVisible();
  await expect(page.getByTestId('chore-card').filter({ hasText: 'Active chore' })).not.toBeVisible();
});
