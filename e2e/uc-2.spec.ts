import { test, expect } from '@playwright/test';
import { today, daysAgo, daysFromNow, waitForApp, seedAndReload, makeChore, makeCompletion } from './helpers/idb';

const NOW = new Date().toISOString();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  await seedAndReload(page, {
    chores: [
      makeChore({ choreId: 'take-vitamins', title: 'Take vitamins', xpSize: 'XS',
        recurrence: { frequency: 'daily', interval: 1, startDate: daysAgo(1), windowStartTime: '00:00' } }),
      makeChore({ choreId: 'floss-teeth', title: 'Floss teeth', xpSize: 'S',
        recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' } }),
      makeChore({ choreId: 'read-book', title: 'Read book', xpSize: 'M',
        recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' } }),
      makeChore({ choreId: 'monthly-budget', title: 'Monthly budget review', xpSize: 'M',
        recurrence: { frequency: 'monthly', interval: 1, startDate: daysFromNow(20), windowStartTime: '00:00' } }),
    ],
    completions: [
      makeCompletion({ id: 'comp-read-today', choreKey: 'personal/read-book',
        completedAt: NOW, xpEarned: 8, streak: 1 }),
    ],
  });
});

test('chores are grouped and ordered correctly', async ({ page }) => {
  const h2s = page.getByRole('heading', { level: 2 });
  const texts = await h2s.allTextContents();
  const overIdx = texts.findIndex((t) => t.includes('Overdue'));
  const dueIdx = texts.findIndex((t) => t.includes('Due'));
  const compIdx = texts.findIndex((t) => t.includes('Completed'));
  const upIdx = texts.findIndex((t) => t.includes('Upcoming'));

  expect(overIdx).toBeGreaterThanOrEqual(0);
  expect(overIdx).toBeLessThan(dueIdx);
  expect(dueIdx).toBeLessThan(compIdx);
  expect(compIdx).toBeLessThan(upIdx);
});

test('each card shows required fields', async ({ page }) => {
  const card = page.getByTestId('chore-card').filter({ hasText: 'Floss teeth' });
  await expect(card.getByText('Due')).toBeVisible();
  await expect(card.getByText(/XP/)).toBeVisible();
  await expect(card.getByText('Daily')).toBeVisible();
});

test('complete a due chore without a page reload', async ({ page }) => {
  const xpBadge = page.getByTestId('xp-badge');
  const xpBeforeText = await xpBadge.textContent() ?? '0 XP';
  const xpBefore = parseInt(xpBeforeText.replace(/[^0-9]/g, ''), 10);

  let pageReloaded = false;
  page.on('load', () => { pageReloaded = true; });

  const card = page.getByTestId('chore-card').filter({ hasText: 'Floss teeth' });
  await card.getByRole('button', { name: 'Complete' }).click();

  await expect(card.getByText('Completed')).toBeVisible();
  const xpAfterText = await xpBadge.textContent() ?? '0 XP';
  const xpAfter = parseInt(xpAfterText.replace(/[^0-9]/g, ''), 10);
  expect(xpAfter).toBeGreaterThan(xpBefore);
  expect(pageReloaded).toBe(false);
});

test('completed chore has no Complete button', async ({ page }) => {
  const card = page.getByTestId('chore-card').filter({ hasText: 'Read book' });
  await expect(card.getByRole('button', { name: 'Complete' })).not.toBeVisible();
});

test('overdue chore can still be completed', async ({ page }) => {
  const card = page.getByTestId('chore-card').filter({ hasText: 'Take vitamins' });
  await card.getByRole('button', { name: 'Complete' }).click();
  await expect(card.getByText('Completed')).toBeVisible();
});

test('upcoming chore has no Complete button', async ({ page }) => {
  const card = page.getByTestId('chore-card').filter({ hasText: 'Monthly budget review' });
  await expect(card.getByRole('button', { name: 'Complete' })).not.toBeVisible();
});
