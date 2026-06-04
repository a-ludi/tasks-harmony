import { test, expect } from '@playwright/test';
import { today, waitForApp, seedAndReload, makeChore, makeCompletion } from './helpers/idb';

const NOW = new Date().toISOString();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  await seedAndReload(page, {
    chores: [
      makeChore({ choreId: 'drink-water', title: 'Drink water', xpSize: 'XS', repeatable: true,
        recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' } }),
      makeChore({ choreId: 'morning-run', title: 'Morning run', xpSize: 'M', repeatable: false,
        recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' } }),
    ],
    completions: [
      makeCompletion({ id: 'comp-water-today', choreKey: 'personal/drink-water',
        completedAt: NOW, xpEarned: 3, streak: 1 }),
      makeCompletion({ id: 'comp-run-today', choreKey: 'personal/morning-run',
        completedAt: NOW, xpEarned: 8, streak: 1 }),
    ],
  });
});

test('repeatable completed chore shows "Complete again"', async ({ page }) => {
  const card = page.getByTestId('chore-card').filter({ hasText: 'Drink water' });
  await expect(card.getByText('Completed')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Complete again' })).toBeVisible();
});

test('completing again adds XP a second time', async ({ page }) => {
  const xpBadge = page.getByTestId('xp-badge');
  const xpBeforeText = await xpBadge.textContent() ?? '0 XP';
  const xpBefore = parseInt(xpBeforeText.replace(/[^0-9]/g, ''), 10);

  const card = page.getByTestId('chore-card').filter({ hasText: 'Drink water' });
  await card.getByRole('button', { name: 'Complete again' }).click();

  await expect(card.getByText('Completed')).toBeVisible();
  const xpAfterText = await xpBadge.textContent() ?? '0 XP';
  const xpAfter = parseInt(xpAfterText.replace(/[^0-9]/g, ''), 10);
  expect(xpAfter).toBeGreaterThan(xpBefore);
});

test('non-repeatable completed chore has no "Complete again"', async ({ page }) => {
  const card = page.getByTestId('chore-card').filter({ hasText: 'Morning run' });
  await expect(card.getByText('Completed')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Complete again' })).not.toBeVisible();
});
