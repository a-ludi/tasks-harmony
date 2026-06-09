import { test, expect } from '@playwright/test';
import { today, waitForApp, seedAndReload, makeChore } from './helpers/idb';

async function openEditModal(page: import('@playwright/test').Page, choreTitle: string) {
  const card = page.getByTestId('chore-card').filter({ hasText: choreTitle });
  await card.getByRole('button', { name: 'Chore actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'Edit Chore' })).toBeVisible();
}

async function addQuestion(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '+ Add Question' }).click();
  await expect(page.getByPlaceholder('e.g. How many minutes did it take?').last()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await seedAndReload(page, {
    chores: [
      makeChore({ choreId: 'workout-log', title: 'Workout log', xpSize: 'M',
        recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' } }),
    ],
  });
});

test('add one question of each type and save', async ({ page }) => {
  await openEditModal(page, 'Workout log');

  // Add TEXT question
  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').last().fill('Notes');

  // Collapse by clicking heading
  await page.getByRole('heading', { name: 'Edit Chore' }).click();

  // Add INTEGER question
  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').last().fill('Duration (minutes)');
  // The last select trigger in the expanded question form is the Type select
  await page.locator('[data-slot="select-trigger"]').last().click();
  await page.getByRole('option', { name: 'Integer' }).click();
  await page.waitForSelector('[data-slot="select-content"]', { state: 'detached' });
  await page.getByPlaceholder('None').first().fill('1');
  await page.getByPlaceholder('None').last().fill('300');

  // Collapse
  await page.getByRole('heading', { name: 'Edit Chore' }).click();

  // Add BOOLEAN question
  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').last().fill('Stretched?');
  await page.locator('[data-slot="select-trigger"]').last().click();
  await page.getByRole('option', { name: 'Yes / No' }).click();
  await page.waitForSelector('[data-slot="select-content"]', { state: 'detached' });

  // Collapse
  await page.getByRole('heading', { name: 'Edit Chore' }).click();

  // Add ENUM question
  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').last().fill('Intensity');
  await page.locator('[data-slot="select-trigger"]').last().click();
  await page.getByRole('option', { name: 'Multiple Choice' }).click();
  await page.waitForSelector('[data-slot="select-content"]', { state: 'detached' });
  // Instant-scroll the dialog to bottom so webkit doesn't animate the scroll on click
  await page.evaluate(() => {
    const el = document.querySelector('[data-slot="dialog-content"]');
    if (el) el.scrollTop = el.scrollHeight;
  });
  await page.getByRole('button', { name: '+ Add Choice' }).click();
  await page.getByPlaceholder('Choice label…').nth(0).fill('Low');
  await page.getByRole('button', { name: '+ Add Choice' }).click();
  await page.getByPlaceholder('Choice label…').nth(1).fill('Medium');
  await page.getByRole('button', { name: '+ Add Choice' }).click();
  await page.getByPlaceholder('Choice label…').nth(2).fill('High');

  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { name: 'Edit Chore' })).not.toBeVisible();

  // Verify 4 questions saved
  await openEditModal(page, 'Workout log');
  await expect(page.getByText('4 question(s)')).toBeVisible();
});

test('reorder questions with up/down controls', async ({ page }) => {
  await openEditModal(page, 'Workout log');

  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').last().fill('Notes');
  // Collapse by clicking header area
  await page.getByRole('heading', { name: 'Edit Chore' }).click();

  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').last().fill('Duration');
  await page.getByRole('heading', { name: 'Edit Chore' }).click();

  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').last().fill('Intensity');
  await page.getByRole('heading', { name: 'Edit Chore' }).click();

  // Intensity is at index 2 (0-based), click its Move up button
  await page.getByTitle('Move up').last().click();

  // After one move up, Intensity should be between Notes and Duration
  // Check text order in the DOM — prompt text is in p.text-sm.font-medium
  const labels = await page.locator('p.text-sm.font-medium').allTextContents();
  const notesIdx = labels.findIndex((t) => t.includes('Notes'));
  const durationIdx = labels.findIndex((t) => t.includes('Duration'));
  const intensityIdx = labels.findIndex((t) => t.includes('Intensity'));
  expect(intensityIdx).toBeGreaterThan(notesIdx);
  expect(intensityIdx).toBeLessThan(durationIdx);
});

test('remove a newly-added question before saving', async ({ page }) => {
  await openEditModal(page, 'Workout log');

  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').last().fill('Mood');

  await page.getByRole('button', { name: 'Remove' }).click();

  await expect(page.getByText('Mood')).not.toBeAttached();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { name: 'Edit Chore' })).not.toBeVisible();
});

test('soft-delete a saved question shows pending removal UI', async ({ page }) => {
  // Save a question first
  await openEditModal(page, 'Workout log');
  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').last().fill('Notes');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  // Reopen and soft-delete
  await openEditModal(page, 'Workout log');
  await page.getByRole('button', { name: 'Remove' }).click();

  // The pending removal section uses text "Pending removal" with CSS uppercase class
  await expect(page.getByText('Pending removal')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();
  await expect(page.locator('p.line-through').filter({ hasText: 'Notes' })).toBeVisible();
});

test('restore a soft-deleted question', async ({ page }) => {
  // Save a question first
  await openEditModal(page, 'Workout log');
  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').last().fill('Notes');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  // Reopen, soft-delete, then restore
  await openEditModal(page, 'Workout log');
  await page.getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Restore' }).click();

  await expect(page.getByText('Pending removal')).not.toBeVisible();
  await expect(page.locator('p.line-through')).not.toBeVisible();
});

test('invalid regex is rejected at save', async ({ page }) => {
  await openEditModal(page, 'Workout log');
  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').last().fill('Notes');
  // Type stays TEXT; fill in the regex field
  await page.getByPlaceholder('e.g. ^\\d{4}$').fill('[');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect(page.getByText(/Invalid regex/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Edit Chore' })).toBeVisible();
});

test('catastrophic regex is rejected at save', async ({ page }) => {
  await openEditModal(page, 'Workout log');
  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').last().fill('Notes');
  await page.getByPlaceholder('e.g. ^\\d{4}$').fill('(a+)+');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect(page.getByText('Pattern may cause catastrophic backtracking').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Edit Chore' })).toBeVisible();
});

test('ENUM choices managed as list with add/remove', async ({ page }) => {
  await openEditModal(page, 'Workout log');
  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').last().fill('Intensity');
  await page.locator('[data-slot="select-trigger"]').last().click();
  await page.getByRole('option', { name: 'Multiple Choice' }).click();

  await page.getByRole('button', { name: '+ Add Choice' }).click();
  await page.getByPlaceholder('Choice label…').nth(0).fill('Low');
  await page.getByRole('button', { name: '+ Add Choice' }).click();
  await page.getByPlaceholder('Choice label…').nth(1).fill('High');

  const inputs = page.getByPlaceholder('Choice label…');
  await expect(inputs).toHaveCount(2);

  // Remove the second choice
  await page.getByTitle('Remove choice').nth(1).click();
  await expect(inputs).toHaveCount(1);
  await expect(inputs.nth(0)).toHaveValue('Low');
});
