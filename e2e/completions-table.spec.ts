import { test, expect } from '@playwright/test';
import { today, waitForApp, seedAndReload, makeChore, makeCompletion } from './helpers/idb';

const CHORE_KEY = 'personal/morning-routine';

const CHOICE_A_ID = 'choice-mood-great';
const CHOICE_B_ID = 'choice-mood-okay';
const CHOICE_C_ID = 'choice-mood-rough';
const Q_MOOD_ID = 'q-mood-ct';

const QUESTIONS = [
  {
    id: Q_MOOD_ID,
    choreKey: CHORE_KEY,
    prompt: 'Mood',
    type: 'ENUM',
    required: false,
    order: 0,
    choices: [
      { id: CHOICE_A_ID, label: 'Great', order: 0 },
      { id: CHOICE_B_ID, label: 'Okay', order: 1 },
      { id: CHOICE_C_ID, label: 'Rough', order: 2 },
    ],
  },
];

const COMPLETIONS = [
  makeCompletion({
    id: 'comp-ct-1',
    choreKey: CHORE_KEY,
    completedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    xpEarned: 5,
    streak: 1,
    answers: [{ questionId: Q_MOOD_ID, value: CHOICE_A_ID }],
  }),
  makeCompletion({
    id: 'comp-ct-2',
    choreKey: CHORE_KEY,
    completedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    xpEarned: 8,
    streak: 2,
    answers: [{ questionId: Q_MOOD_ID, value: CHOICE_B_ID }],
  }),
  makeCompletion({
    id: 'comp-ct-3',
    choreKey: CHORE_KEY,
    completedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    xpEarned: 10,
    streak: 3,
    answers: [{ questionId: Q_MOOD_ID, value: CHOICE_A_ID }],
  }),
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await seedAndReload(page, {
    chores: [
      makeChore({
        choreId: 'morning-routine',
        title: 'Morning routine',
        xpSize: 'S',
        recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' },
      }),
    ],
    questions: QUESTIONS,
    completions: COMPLETIONS,
  });
  // Navigate to the chore detail page via the title link
  await page.getByTestId('chore-card').filter({ hasText: 'Morning routine' }).getByRole('link', { name: 'Morning routine' }).click();
  await expect(page).toHaveURL(/\/chores\/.+/);
  await expect(page.getByRole('columnheader', { name: 'Completed at' })).toBeVisible();
});

// Scenario A: Sort badge appears when clicking a column header
test('clicking Completed at header shows sort indicator and Reset sorting clears it', async ({ page }) => {
  const completedAtHeader = page.getByRole('columnheader', { name: 'Completed at' });

  // No sort indicator initially (no ↑/↓ with superscript)
  await expect(page.getByRole('button', { name: 'Reset sorting' })).not.toBeVisible();

  // Click to sort
  await completedAtHeader.click();
  // ↑ indicator should appear (asc sort, superscript 1)
  await expect(completedAtHeader.locator('span').last()).toContainText('↑');
  // Reset sorting button should appear
  const resetButton = page.getByRole('button', { name: 'Reset sorting' });
  await expect(resetButton).toBeVisible();

  // Click Reset sorting
  await resetButton.click();
  // Reset button should disappear
  await expect(resetButton).not.toBeVisible();
});

// Scenario B: Second sort column gets superscript "2"
test('clicking a second column header shows superscript 2 on that column', async ({ page }) => {
  const completedAtHeader = page.getByRole('columnheader', { name: 'Completed at' });
  const xpHeader = page.getByRole('columnheader', { name: 'XP earned' });

  await completedAtHeader.click();
  await xpHeader.click();

  // XP earned header should show superscript 2
  const xpLabel = xpHeader.locator('span').last();
  await expect(xpLabel).toContainText('2');
});

// Scenario C: Accordion grouping opens and closes group header rows
test('grouping by ENUM question shows accordion rows that open and close', async ({ page }) => {
  // Click "+ Group by"
  await page.getByRole('button', { name: '+ Group by' }).click();
  // Select Mood from the dropdown
  await page.getByRole('menuitem', { name: 'Mood' }).click();

  // Group rows should now be visible — find any group header row
  const groupRows = page.locator('tr[data-group]');
  await expect(groupRows.first()).toBeVisible();

  // Initially all groups are closed (▸)
  const firstGroupRow = groupRows.first();
  await expect(firstGroupRow).toContainText('▸');

  // Click to open the first group
  await firstGroupRow.click();
  await expect(firstGroupRow).toContainText('▾');
  // data-group-open should be "true"
  await expect(firstGroupRow).toHaveAttribute('data-group-open', 'true');

  // Click again to close
  await firstGroupRow.click();
  await expect(firstGroupRow).toContainText('▸');
  await expect(firstGroupRow).toHaveAttribute('data-group-open', 'false');
});

// Scenario D: CSV export triggers a download with a matching filename
test('Export as CSV triggers a download with correct filename pattern', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');

  await page.getByRole('button', { name: 'Export ▾' }).click();
  await page.getByRole('menuitem', { name: 'Export as CSV' }).click();

  const download = await downloadPromise;
  // Filename should match: YYYY-MM-DD-completions-morning-routine.csv
  expect(download.suggestedFilename()).toMatch(/^\d{4}-\d{2}-\d{2}-completions-morning-routine\.csv$/);
});
