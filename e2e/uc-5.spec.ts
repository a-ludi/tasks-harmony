import { test, expect } from '@playwright/test';
import { today, waitForApp, seedAndReload, makeChore } from './helpers/idb';

const CHORE_KEY = 'personal/workout-log';
const Q_NOTES_ID = 'q-notes-uc5';
const Q_DURATION_ID = 'q-duration-uc5';
const Q_STRETCHED_ID = 'q-stretched-uc5';
const Q_INTENSITY_ID = 'q-intensity-uc5';
const CHOICE_LOW_ID = 'choice-low-uc5';
const CHOICE_MEDIUM_ID = 'choice-medium-uc5';
const CHOICE_HIGH_ID = 'choice-high-uc5';

const QUESTIONS = [
  { id: Q_NOTES_ID, choreKey: CHORE_KEY, prompt: 'Notes', type: 'TEXT', required: false, order: 0, regexPattern: '^\\w+.*' },
  { id: Q_DURATION_ID, choreKey: CHORE_KEY, prompt: 'Duration (minutes)', type: 'INTEGER', required: true, order: 1, minValue: 1, maxValue: 300 },
  { id: Q_STRETCHED_ID, choreKey: CHORE_KEY, prompt: 'Stretched?', type: 'BOOLEAN', required: true, order: 2 },
  { id: Q_INTENSITY_ID, choreKey: CHORE_KEY, prompt: 'Intensity', type: 'ENUM', required: true, order: 3,
    choices: [{ id: CHOICE_LOW_ID, label: 'Low', order: 0 }, { id: CHOICE_MEDIUM_ID, label: 'Medium', order: 1 }, { id: CHOICE_HIGH_ID, label: 'High', order: 2 }] },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await seedAndReload(page, {
    chores: [makeChore({ choreId: 'workout-log', title: 'Workout log', xpSize: 'M',
      recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' } })],
    questions: QUESTIONS,
  });
});

async function openModal(page: import('@playwright/test').Page) {
  await page.getByTestId('chore-card').filter({ hasText: 'Workout log' })
    .getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Complete Chore' })).toBeVisible();
}

// AnswerField renders <label> as a block sibling (not wrapping) for TEXT/INTEGER/ENUM,
// so getByLabel cannot associate them. Use type-based selectors scoped to the modal.
function notesInput(page: import('@playwright/test').Page) {
  return page.locator('[data-slot="input"]:not([type])').first();
}
function durationInput(page: import('@playwright/test').Page) {
  return page.locator('input[type="number"]');
}
function stretchedCheckbox(page: import('@playwright/test').Page) {
  return page.locator('input[type="checkbox"]');
}
async function selectIntensity(page: import('@playwright/test').Page, label: string) {
  await page.locator('[data-slot="select-trigger"]').last().click();
  await page.getByRole('option', { name: label }).click();
}

test('tapping Complete opens the question modal', async ({ page }) => {
  await openModal(page);
  await expect(page.getByText('Notes')).toBeVisible();
  await expect(page.getByText('Duration (minutes)')).toBeVisible();
  await expect(page.getByText('Stretched?')).toBeVisible();
  await expect(page.getByText('Intensity')).toBeVisible();
});

test('modal is scrollable on small viewports', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openModal(page);
  const modal = page.locator('.max-h-\\[90vh\\].overflow-y-auto');
  await expect(modal).toBeVisible();
  await expect(page.getByText('Intensity')).toBeVisible();
});

test('submit valid answers completes the chore', async ({ page }) => {
  await openModal(page);
  await notesInput(page).fill('Great');
  await durationInput(page).fill('45');
  await stretchedCheckbox(page).check();
  await selectIntensity(page, 'Medium');
  await page.getByRole('button', { name: 'Submit & Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Complete Chore' })).not.toBeVisible();
  await expect(page.getByTestId('chore-card').filter({ hasText: 'Workout log' }).getByText('Completed')).toBeVisible();
});

test('required field left blank blocks submission', async ({ page }) => {
  await openModal(page);
  await stretchedCheckbox(page).check();
  await selectIntensity(page, 'Low');
  await page.getByRole('button', { name: 'Submit & Complete' }).click();
  await expect(page.getByText('This field is required').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Complete Chore' })).toBeVisible();
});

test('optional field can be left blank', async ({ page }) => {
  await openModal(page);
  await durationInput(page).fill('30');
  await stretchedCheckbox(page).check();
  await selectIntensity(page, 'High');
  await page.getByRole('button', { name: 'Submit & Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Complete Chore' })).not.toBeVisible();
});

test('TEXT answer failing regex blocks submission', async ({ page }) => {
  await openModal(page);
  await notesInput(page).fill('   ');
  await durationInput(page).fill('30');
  await stretchedCheckbox(page).check();
  await selectIntensity(page, 'Medium');
  await page.getByRole('button', { name: 'Submit & Complete' }).click();
  await expect(page.getByText(/does not match the required pattern/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Complete Chore' })).toBeVisible();
});

test('INTEGER below minimum blocks submission', async ({ page }) => {
  await openModal(page);
  await durationInput(page).fill('0');
  await stretchedCheckbox(page).check();
  await selectIntensity(page, 'Low');
  await page.getByRole('button', { name: 'Submit & Complete' }).click();
  await expect(page.getByText('Value must be at least 1')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Complete Chore' })).toBeVisible();
});

test('INTEGER above maximum blocks submission', async ({ page }) => {
  await openModal(page);
  await durationInput(page).fill('301');
  await stretchedCheckbox(page).check();
  await selectIntensity(page, 'Low');
  await page.getByRole('button', { name: 'Submit & Complete' }).click();
  await expect(page.getByText('Value must be at most 300')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Complete Chore' })).toBeVisible();
});

test('invalid ENUM value blocks submission', () => {
  test.skip(true, 'ENUM boundary covered by unit test in src/questions/validation.test.ts');
});
