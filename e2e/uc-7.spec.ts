import { test, expect } from '@playwright/test';
import { today, waitForApp, seedAndReload, makeChore } from './helpers/idb';

test.describe('UC-7 Edge Cases', () => {
  test('malformed chore still appears on dashboard', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    await seedAndReload(page, {
      chores: [
        makeChore({
          choreId: 'morning-run',
          title: 'Morning run',
          recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' },
        }),
        makeChore({
          choreId: 'broken-chore',
          title: 'Broken chore',
          recurrence: { frequency: 'daily', interval: 1, windowStartTime: '00:00' },
        }),
      ],
    });

    await expect(page.locator('nav')).toBeVisible();
    await expect(page.getByTestId('chore-card').filter({ hasText: 'Broken chore' })).toBeVisible();
    await expect(page.getByTestId('chore-card').filter({ hasText: 'Morning run' })).toBeVisible();
  });

  test('malformed chore shows no due/overdue badge', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    await seedAndReload(page, {
      chores: [
        makeChore({
          choreId: 'morning-run',
          title: 'Morning run',
          recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' },
        }),
        makeChore({
          choreId: 'broken-chore',
          title: 'Broken chore',
          recurrence: { frequency: 'daily', interval: 1, windowStartTime: '00:00' },
        }),
      ],
    });

    const brokenCard = page.getByTestId('chore-card').filter({ hasText: 'Broken chore' });
    await expect(brokenCard.getByText('Due')).not.toBeVisible();
    await expect(brokenCard.getByText('Overdue')).not.toBeVisible();

    const morningCard = page.getByTestId('chore-card').filter({ hasText: 'Morning run' });
    await expect(morningCard.getByText('Due')).toBeVisible();
  });

  test('completion with valid timestamp is accepted', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    await seedAndReload(page, {
      chores: [
        makeChore({
          choreId: 'morning-run',
          title: 'Morning run',
          recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' },
        }),
      ],
    });

    const xpBadge = page.getByTestId('xp-badge');
    const xpBeforeText = await xpBadge.textContent() ?? '0 XP';
    const xpBefore = parseInt(xpBeforeText.replace(/[^0-9]/g, ''), 10);

    const card = page.getByTestId('chore-card').filter({ hasText: 'Morning run' });
    await card.getByRole('button', { name: 'Complete' }).click();

    await expect(card.getByText('Completed')).toBeVisible();
    const xpAfterText = await xpBadge.textContent() ?? '0 XP';
    const xpAfter = parseInt(xpAfterText.replace(/[^0-9]/g, ''), 10);
    expect(xpAfter).toBeGreaterThan(xpBefore);
  });
});
