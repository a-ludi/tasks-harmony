# E2E Playwright Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Playwright E2E tests covering all seven use cases in `docs/use-cases/`.

**Architecture:** Each test navigates to the running dev server, seeds IndexedDB with scenario-specific data via `page.evaluate()`, reloads the page, and exercises the UI using role-based locators. No mocking — the full React+Zustand+IDB stack runs end-to-end in a headless browser.

**Tech Stack:** `@playwright/test` (already installed), Bun dev server (`bun run dev`), chrome-headless-shell (already downloaded via `@playwright/cli`)

---

## Task 1: Playwright config, test helpers, and ChoreCard test-id

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/helpers/idb.ts`
- Modify: `package.json` (add `test:e2e` script)
- Modify: `src/components/dashboard/ChoreCard.tsx` (add `data-testid`)

- [ ] **Step 1: Add `data-testid="chore-card"` to ChoreCard root div**

In `src/components/dashboard/ChoreCard.tsx`, change line 55:
```tsx
// before
<div className={`rounded-xl border border-gray-200 border-l-4 ${BORDER_COLOR[status]} bg-white p-4 shadow-sm`}>
// after
<div data-testid="chore-card" className={`rounded-xl border border-gray-200 border-l-4 ${BORDER_COLOR[status]} bg-white p-4 shadow-sm`}>
```

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

function findHeadlessShell(): string | undefined {
  const cacheHome = process.env.XDG_CACHE_HOME ?? path.join(process.env.HOME ?? '/root', '.cache');
  const base = path.join(cacheHome, 'ms-playwright');
  if (!fs.existsSync(base)) return undefined;
  const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-'));
  if (dirs.length === 0) return undefined;
  const candidate = path.join(
    base, dirs[0], 'chrome-headless-shell-linux64', 'chrome-headless-shell',
  );
  return fs.existsSync(candidate) ? candidate : undefined;
}

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://localhost:5173',
    browserName: 'chromium',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? findHeadlessShell(),
      chromiumSandbox: false,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-setuid-sandbox'],
    },
  },
});
```

- [ ] **Step 3: Create `e2e/helpers/idb.ts`**

```ts
import type { Page } from '@playwright/test';

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function seedDatabase(
  page: Page,
  data: Record<string, unknown[]>,
): Promise<void> {
  await page.evaluate(async (data) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('tasks-harmony', 1);
      req.onsuccess = () => {
        const db = req.result;
        const storeNames = Object.keys(data);
        if (storeNames.length === 0) { resolve(); return; }
        const tx = (db as IDBDatabase).transaction(storeNames, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject((tx as IDBTransaction).error);
        for (const [name, records] of Object.entries(data)) {
          const store = tx.objectStore(name);
          for (const record of records as object[]) {
            store.put(record);
          }
        }
      };
      req.onerror = () => reject(req.error);
    });
  }, data as Record<string, object[]>);
}

export async function waitForApp(page: Page): Promise<void> {
  await page.waitForSelector('nav', { state: 'visible', timeout: 15_000 });
}

export async function seedAndReload(
  page: Page,
  data: Record<string, unknown[]>,
): Promise<void> {
  await seedDatabase(page, data);
  await page.reload();
  await waitForApp(page);
}

export function makeChore(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    choreId: 'default-chore',
    packId: 'personal',
    title: 'Untitled',
    xpSize: 'S',
    recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' },
    repeatable: false,
    active: true,
    createdAt: new Date().toISOString(),
    ...overrides,
    key: overrides.key ?? `personal/${overrides.choreId ?? 'default-chore'}`,
  };
}

export function makeCompletion(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    completedAt: new Date().toISOString(),
    xpEarned: 5,
    streak: 1,
    answers: [],
    ...overrides,
  };
}
```

- [ ] **Step 4: Add `test:e2e` script to `package.json`**

Add to `"scripts"`:
```json
"test:e2e": "bunx playwright test"
```

- [ ] **Step 5: Run a smoke test to verify the setup**

With the dev server running (`bun run dev`):
```bash
XDG_CACHE_HOME=/tmp/claude-1001/cache bunx playwright test --list
```
Expected: lists test files (none yet — that is fine, 0 tests is OK as long as it doesn't error)

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e/helpers/idb.ts package.json src/components/dashboard/ChoreCard.tsx
git commit -m "test: add Playwright config, IDB seed helper, and chore-card test-id"
```

---

## Task 2: UC-1 — First Day

**Files:**
- Create: `e2e/uc-1.spec.ts`

- [ ] **Step 1: Create `e2e/uc-1.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { today, daysFromNow, waitForApp } from './helpers/idb';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
});

test('empty state shows "No chores yet."', async ({ page }) => {
  await expect(page.getByText('No chores yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ New Chore' })).toBeVisible();
});

test('create a valid chore', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Chore' }).click();
  await page.getByLabel('Title').fill('Floss');
  await page.getByLabel('XP Size').selectOption('S');
  await page.getByLabel('Frequency').selectOption('Daily');
  await page.getByLabel('Interval').fill('1');
  await page.getByRole('button', { name: 'Create Chore' }).click();

  const card = page.getByTestId('chore-card').filter({ hasText: 'Floss' });
  await expect(card).toBeVisible();
  await expect(card.getByText('Due')).toBeVisible();
});

test('start date defaults to today', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Chore' }).click();
  await expect(page.getByLabel('Start Date')).toHaveValue(today());
});

test('name is required', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Chore' }).click();
  await page.getByRole('button', { name: 'Create Chore' }).click();
  await expect(page.getByText('Title is required.')).toBeVisible();
  // Modal stays open — no card appears
  await expect(page.getByTestId('chore-card')).not.toBeVisible();
});

test('interval must be a positive integer', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Chore' }).click();
  await page.getByLabel('Title').fill('Floss');
  await page.getByLabel('Interval').fill('0');
  await page.getByRole('button', { name: 'Create Chore' }).click();
  await expect(page.getByText('Interval must be a whole number of 1 or more.')).toBeVisible();
});

test('upcoming chore shows "Upcoming" badge', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Chore' }).click();
  await page.getByLabel('Title').fill('Future Task');
  await page.getByLabel('Start Date').fill(daysFromNow(5));
  await page.getByRole('button', { name: 'Create Chore' }).click();

  const card = page.getByTestId('chore-card').filter({ hasText: 'Future Task' });
  await expect(card.getByText('Upcoming')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Complete' })).not.toBeVisible();
});
```

- [ ] **Step 2: Run the tests**

```bash
XDG_CACHE_HOME=/tmp/claude-1001/cache bunx playwright test e2e/uc-1.spec.ts
```
Expected: all 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/uc-1.spec.ts
git commit -m "test(e2e): UC-1 first-day scenarios"
```

---

## Task 3: UC-2 — Daily Routine

**Files:**
- Create: `e2e/uc-2.spec.ts`

- [ ] **Step 1: Create `e2e/uc-2.spec.ts`**

```ts
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
  const xpBadge = page.locator('nav').getByText(/XP/);
  const xpBefore = await xpBadge.textContent();

  const card = page.getByTestId('chore-card').filter({ hasText: 'Floss teeth' });
  await card.getByRole('button', { name: 'Complete' }).click();

  await expect(card.getByText('Completed')).toBeVisible();
  const xpAfter = await xpBadge.textContent();
  expect(xpAfter).not.toBe(xpBefore);
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
```

- [ ] **Step 2: Run the tests**

```bash
XDG_CACHE_HOME=/tmp/claude-1001/cache bunx playwright test e2e/uc-2.spec.ts
```
Expected: all 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/uc-2.spec.ts
git commit -m "test(e2e): UC-2 daily routine scenarios"
```

---

## Task 4: UC-2b — Repeatable Chore

**Files:**
- Create: `e2e/uc-2b.spec.ts`

- [ ] **Step 1: Create `e2e/uc-2b.spec.ts`**

```ts
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
  const xpBadge = page.locator('nav').getByText(/XP/);
  const xpBefore = await xpBadge.textContent();

  const card = page.getByTestId('chore-card').filter({ hasText: 'Drink water' });
  await card.getByRole('button', { name: 'Complete again' }).click();

  const xpAfter = await xpBadge.textContent();
  expect(xpAfter).not.toBe(xpBefore);
  await expect(card.getByText('Completed')).toBeVisible();
});

test('non-repeatable completed chore has no "Complete again"', async ({ page }) => {
  const card = page.getByTestId('chore-card').filter({ hasText: 'Morning run' });
  await expect(card.getByText('Completed')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Complete again' })).not.toBeVisible();
});
```

- [ ] **Step 2: Run the tests**

```bash
XDG_CACHE_HOME=/tmp/claude-1001/cache bunx playwright test e2e/uc-2b.spec.ts
```
Expected: all 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/uc-2b.spec.ts
git commit -m "test(e2e): UC-2b repeatable chore scenarios"
```

---

## Task 5: UC-3 — Chore Management

**Files:**
- Create: `e2e/uc-3.spec.ts`

- [ ] **Step 1: Create `e2e/uc-3.spec.ts`**

```ts
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
  await card.getByTitle('Edit chore').click();

  await expect(page.getByLabel('Title')).toHaveValue('Floss teeth');
  await expect(page.getByLabel('XP Size')).toHaveValue('S');
  await expect(page.getByLabel('Frequency')).toHaveValue('daily');
  await expect(page.getByLabel('Interval')).toHaveValue('1');
});

test('save edited chore updates the card', async ({ page }) => {
  const card = page.getByTestId('chore-card').filter({ hasText: 'Floss teeth' });
  await card.getByTitle('Edit chore').click();

  await page.getByLabel('Title').fill('Floss & rinse');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect(page.getByTestId('chore-card').filter({ hasText: 'Floss & rinse' })).toBeVisible();
  await expect(page.getByTestId('chore-card').filter({ hasText: 'Floss teeth' })).not.toBeVisible();
});

test('validation errors block save', async ({ page }) => {
  const card = page.getByTestId('chore-card').filter({ hasText: 'Floss teeth' });
  await card.getByTitle('Edit chore').click();

  await page.getByLabel('Title').fill('');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect(page.getByText('Title is required.')).toBeVisible();
  // Modal stays open
  await expect(page.getByRole('heading', { name: 'Edit Chore' })).toBeVisible();
});

test('deactivate a chore removes it from dashboard', async ({ page }) => {
  const card = page.getByTestId('chore-card').filter({ hasText: 'Take vitamins' });

  page.on('dialog', (dialog) => dialog.accept());
  await card.getByRole('button', { name: 'Archive' }).click();

  await expect(page.getByTestId('chore-card').filter({ hasText: 'Take vitamins' })).not.toBeVisible();
  await expect(page.getByTestId('chore-card').filter({ hasText: 'Floss teeth' })).toBeVisible();
});
```

- [ ] **Step 2: Run the tests**

```bash
XDG_CACHE_HOME=/tmp/claude-1001/cache bunx playwright test e2e/uc-3.spec.ts
```
Expected: all 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/uc-3.spec.ts
git commit -m "test(e2e): UC-3 chore management scenarios"
```

---

## Task 6: UC-4 — Question Builder

**Files:**
- Create: `e2e/uc-4.spec.ts`

Note: QuestionBuilder only appears in the **edit** form, not the new-chore form. All tests open the edit modal for a seeded chore.

- [ ] **Step 1: Create `e2e/uc-4.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { today, waitForApp, seedAndReload, makeChore } from './helpers/idb';

async function openEditModal(page: import('@playwright/test').Page, choreTitle: string) {
  const card = page.getByTestId('chore-card').filter({ hasText: choreTitle });
  await card.getByTitle('Edit chore').click();
  await expect(page.getByRole('heading', { name: 'Edit Chore' })).toBeVisible();
}

async function addQuestion(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '+ Add Question' }).click();
  // New question auto-expands; wait for the prompt input to appear
  await expect(page.getByPlaceholder('e.g. How many minutes did it take?')).toBeVisible();
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

  // TEXT question
  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').fill('Notes');
  // Type stays TEXT (default)

  // INTEGER question
  await addQuestion(page);
  const prompts = page.getByPlaceholder('e.g. How many minutes did it take?');
  await prompts.last().fill('Duration (minutes)');
  await page.getByLabel('Type').last().selectOption('Integer');
  await page.getByLabel('Min Value').fill('1');
  await page.getByLabel('Max Value').fill('300');

  // BOOLEAN question
  await addQuestion(page);
  await prompts.last().fill('Stretched?');
  await page.getByLabel('Type').last().selectOption('Yes / No');

  // ENUM question
  await addQuestion(page);
  await prompts.last().fill('Intensity');
  await page.getByLabel('Type').last().selectOption('Multiple Choice');
  await page.getByRole('button', { name: '+ Add Choice' }).click();
  await page.getByPlaceholder('Choice label…').nth(0).fill('Low');
  await page.getByRole('button', { name: '+ Add Choice' }).click();
  await page.getByPlaceholder('Choice label…').nth(1).fill('Medium');
  await page.getByRole('button', { name: '+ Add Choice' }).click();
  await page.getByPlaceholder('Choice label…').nth(2).fill('High');

  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { name: 'Edit Chore' })).not.toBeVisible();

  // Verify questions saved by reopening edit
  await openEditModal(page, 'Workout log');
  await expect(page.getByText('4 question(s)')).toBeVisible();
});

test('reorder questions with up/down controls', async ({ page }) => {
  await openEditModal(page, 'Workout log');

  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').fill('Notes');

  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').last().fill('Duration');

  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').last().fill('Stretched?');

  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').last().fill('Intensity');

  // Move "Intensity" up twice (it's currently last at index 3)
  const intensityRow = page.locator('[data-question-id], .rounded-lg').filter({ hasText: 'Intensity' }).first();
  // Click away from the expanded prompt area first to collapse
  await page.getByRole('heading', { name: 'Edit Chore' }).click();

  // Use Move up buttons — find the ▲ button in the Intensity row
  const intensityCollapsed = page.locator('div').filter({ has: page.getByText('Intensity') }).filter({ hasText: '▸' }).first();
  await intensityCollapsed.getByTitle('Move up').click();
  await intensityCollapsed.getByTitle('Move up').click();

  // After two moves up, Intensity should be at position 1 (after Notes)
  const questionLabels = await page.locator('p.font-medium.text-gray-800, p.text-sm.font-medium').allTextContents();
  const activeLabels = questionLabels.filter((t) => t.trim() && !t.includes('question'));
  const intensityIdx = activeLabels.findIndex((t) => t.includes('Intensity'));
  const durationIdx = activeLabels.findIndex((t) => t.includes('Duration'));
  expect(intensityIdx).toBeLessThan(durationIdx);
});

test('remove a newly-added question before saving', async ({ page }) => {
  await openEditModal(page, 'Workout log');

  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').fill('Mood');

  await page.getByRole('button', { name: 'Remove' }).click();

  await expect(page.getByText('Mood')).not.toBeVisible();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { name: 'Edit Chore' })).not.toBeVisible();
});

test('soft-delete a saved question shows faded restore UI', async ({ page }) => {
  // First save a question
  await openEditModal(page, 'Workout log');
  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').fill('Notes');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  // Reopen and soft-delete
  await openEditModal(page, 'Workout log');
  await page.getByRole('button', { name: 'Remove' }).click();

  // Notes should appear in "Pending removal" section with a Restore button
  await expect(page.getByText('Pending removal')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();
  // The question row should be in faded/strikethrough style
  await expect(page.locator('p.line-through').filter({ hasText: 'Notes' })).toBeVisible();
});

test('restore a soft-deleted question', async ({ page }) => {
  // Save a question first
  await openEditModal(page, 'Workout log');
  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').fill('Notes');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  // Reopen, soft-delete, then restore
  await openEditModal(page, 'Workout log');
  await page.getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Restore' }).click();

  // Notes should be back in active state
  await expect(page.getByText('Pending removal')).not.toBeVisible();
  await expect(page.locator('p.line-through')).not.toBeVisible();
});

test('invalid regex is rejected at save', async ({ page }) => {
  await openEditModal(page, 'Workout log');
  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').fill('Notes');
  // Regex Pattern field appears for TEXT type
  await page.getByPlaceholder('e.g. ^\\d{4}$').fill('[');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect(page.getByText(/Invalid regex/)).toBeVisible();
  // Modal stays open
  await expect(page.getByRole('heading', { name: 'Edit Chore' })).toBeVisible();
});

test('catastrophically-backtracking regex is rejected at save', async ({ page }) => {
  await openEditModal(page, 'Workout log');
  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').fill('Notes');
  await page.getByPlaceholder('e.g. ^\\d{4}$').fill('(a+)+');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect(page.getByText('Pattern may cause catastrophic backtracking')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Edit Chore' })).toBeVisible();
});

test('ENUM choices are managed as a list with add/remove/reorder', async ({ page }) => {
  await openEditModal(page, 'Workout log');
  await addQuestion(page);
  await page.getByPlaceholder('e.g. How many minutes did it take?').fill('Intensity');
  await page.getByLabel('Type').last().selectOption('Multiple Choice');

  // Add choices via individual controls
  await page.getByRole('button', { name: '+ Add Choice' }).click();
  await page.getByPlaceholder('Choice label…').nth(0).fill('Low');
  await page.getByRole('button', { name: '+ Add Choice' }).click();
  await page.getByPlaceholder('Choice label…').nth(1).fill('High');

  // Verify two inputs
  const inputs = page.getByPlaceholder('Choice label…');
  await expect(inputs).toHaveCount(2);

  // Remove the second choice
  await page.getByTitle('Remove choice').nth(1).click();
  await expect(inputs).toHaveCount(1);
  await expect(inputs.nth(0)).toHaveValue('Low');
});
```

- [ ] **Step 2: Run the tests**

```bash
XDG_CACHE_HOME=/tmp/claude-1001/cache bunx playwright test e2e/uc-4.spec.ts
```
Expected: all 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/uc-4.spec.ts
git commit -m "test(e2e): UC-4 question builder scenarios"
```

---

## Task 7: UC-5 — Question Completion

**Files:**
- Create: `e2e/uc-5.spec.ts`

Seed a "Workout log" chore with four questions (TEXT/INTEGER/BOOLEAN/ENUM) directly in IndexedDB. The ENUM choice IDs are fixed UUIDs so tests can select by ID.

- [ ] **Step 1: Create `e2e/uc-5.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { today, waitForApp, seedAndReload, makeChore } from './helpers/idb';

const CHORE_KEY = 'personal/workout-log';

const Q_NOTES_ID = 'q-notes-id';
const Q_DURATION_ID = 'q-duration-id';
const Q_STRETCHED_ID = 'q-stretched-id';
const Q_INTENSITY_ID = 'q-intensity-id';
const CHOICE_LOW_ID = 'choice-low-id';
const CHOICE_MEDIUM_ID = 'choice-medium-id';
const CHOICE_HIGH_ID = 'choice-high-id';

const QUESTIONS = [
  { id: Q_NOTES_ID, choreKey: CHORE_KEY, prompt: 'Notes', type: 'TEXT', required: false, order: 0,
    regexPattern: '^\\w+.*' },
  { id: Q_DURATION_ID, choreKey: CHORE_KEY, prompt: 'Duration (minutes)', type: 'INTEGER', required: true,
    order: 1, minValue: 1, maxValue: 300 },
  { id: Q_STRETCHED_ID, choreKey: CHORE_KEY, prompt: 'Stretched?', type: 'BOOLEAN', required: true, order: 2 },
  { id: Q_INTENSITY_ID, choreKey: CHORE_KEY, prompt: 'Intensity', type: 'ENUM', required: true, order: 3,
    choices: [
      { id: CHOICE_LOW_ID, label: 'Low', order: 0 },
      { id: CHOICE_MEDIUM_ID, label: 'Medium', order: 1 },
      { id: CHOICE_HIGH_ID, label: 'High', order: 2 },
    ] },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await seedAndReload(page, {
    chores: [
      makeChore({ choreId: 'workout-log', title: 'Workout log', xpSize: 'M',
        recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' } }),
    ],
    questions: QUESTIONS,
  });
});

async function openModal(page: import('@playwright/test').Page) {
  const card = page.getByTestId('chore-card').filter({ hasText: 'Workout log' });
  await card.getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Complete Chore' })).toBeVisible();
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
  // The modal container should have overflow-y-auto and be scrollable
  const modal = page.locator('div.max-h-\\[90vh\\].overflow-y-auto');
  await expect(modal).toBeVisible();
  // All questions should be reachable
  await expect(page.getByText('Intensity')).toBeVisible();
});

test('submit valid answers completes the chore', async ({ page }) => {
  await openModal(page);

  await page.getByLabel('Notes').fill('Great');
  await page.getByLabel('Duration (minutes)').fill('45');
  await page.getByLabel('Stretched?').check();
  await page.getByLabel('Intensity').selectOption({ label: 'Medium' });

  await page.getByRole('button', { name: 'Submit & Complete' }).click();

  await expect(page.getByRole('heading', { name: 'Complete Chore' })).not.toBeVisible();
  const card = page.getByTestId('chore-card').filter({ hasText: 'Workout log' });
  await expect(card.getByText('Completed')).toBeVisible();
});

test('required field left blank blocks submission', async ({ page }) => {
  await openModal(page);

  // Leave Duration blank, fill others
  await page.getByLabel('Stretched?').check();
  await page.getByLabel('Intensity').selectOption({ label: 'Low' });

  await page.getByRole('button', { name: 'Submit & Complete' }).click();

  await expect(page.getByText('This field is required').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Complete Chore' })).toBeVisible();
});

test('optional field can be left blank', async ({ page }) => {
  await openModal(page);

  // Leave Notes blank (optional)
  await page.getByLabel('Duration (minutes)').fill('30');
  await page.getByLabel('Stretched?').check();
  await page.getByLabel('Intensity').selectOption({ label: 'High' });

  await page.getByRole('button', { name: 'Submit & Complete' }).click();

  await expect(page.getByRole('heading', { name: 'Complete Chore' })).not.toBeVisible();
});

test('TEXT answer failing regex blocks submission', async ({ page }) => {
  await openModal(page);

  await page.getByLabel('Notes').fill('   ');
  await page.getByLabel('Duration (minutes)').fill('30');
  await page.getByLabel('Stretched?').check();
  await page.getByLabel('Intensity').selectOption({ label: 'Medium' });

  await page.getByRole('button', { name: 'Submit & Complete' }).click();

  await expect(page.getByText(/does not match the required pattern/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Complete Chore' })).toBeVisible();
});

test('INTEGER below minimum blocks submission', async ({ page }) => {
  await openModal(page);

  await page.getByLabel('Duration (minutes)').fill('0');
  await page.getByLabel('Stretched?').check();
  await page.getByLabel('Intensity').selectOption({ label: 'Low' });

  await page.getByRole('button', { name: 'Submit & Complete' }).click();

  await expect(page.getByText('Value must be at least 1')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Complete Chore' })).toBeVisible();
});

test('INTEGER above maximum blocks submission', async ({ page }) => {
  await openModal(page);

  await page.getByLabel('Duration (minutes)').fill('301');
  await page.getByLabel('Stretched?').check();
  await page.getByLabel('Intensity').selectOption({ label: 'Low' });

  await page.getByRole('button', { name: 'Submit & Complete' }).click();

  await expect(page.getByText('Value must be at most 300')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Complete Chore' })).toBeVisible();
});

test('invalid ENUM value blocks submission via programmatic input', async ({ page }) => {
  await openModal(page);

  // Inject an invalid value into the ENUM select element
  await page.evaluate((qId) => {
    const select = document.querySelector(`select`) as HTMLSelectElement | null;
    if (select) {
      // Override the select's value to something not in choices
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, 'not-a-valid-choice-id');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, Q_INTENSITY_ID);

  await page.getByLabel('Duration (minutes)').fill('45');
  await page.getByLabel('Stretched?').check();

  await page.getByRole('button', { name: 'Submit & Complete' }).click();

  // Invalid ENUM should be caught by validateAnswer
  await expect(page.getByText('Invalid choice')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Complete Chore' })).toBeVisible();
});
```

- [ ] **Step 2: Run the tests**

```bash
XDG_CACHE_HOME=/tmp/claude-1001/cache bunx playwright test e2e/uc-5.spec.ts
```
Expected: all 9 tests pass. If the ENUM programmatic test is flaky (select override is tricky), adjust the `page.evaluate` approach to dispatch a React-compatible change event.

- [ ] **Step 3: Commit**

```bash
git add e2e/uc-5.spec.ts
git commit -m "test(e2e): UC-5 question completion scenarios"
```

---

## Task 8: UC-6 — Profile

**Files:**
- Create: `e2e/uc-6.spec.ts`

- [ ] **Step 1: Create `e2e/uc-6.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { waitForApp, seedAndReload, makeCompletion } from './helpers/idb';

// Alice has 240 XP total (single large completion for simplicity)
const ALICE_PROFILE = {
  id: 'me',
  displayName: 'Alice',
  email: 'alice@example.com',
  activeXPSettingsId: 'standard',
};

test.beforeEach(async ({ page }) => {
  await page.goto('/profile');
  await waitForApp(page);
  await seedAndReload(page, {
    profile: [ALICE_PROFILE],
    completions: [makeCompletion({ id: 'xp-seed', choreKey: 'personal/any', xpEarned: 240, streak: 1 })],
  });
  await page.goto('/profile');
  await waitForApp(page);
});

test('profile page shows required stats', async ({ page }) => {
  await expect(page.getByDisplayValue('Alice')).toBeVisible();
  await expect(page.getByText('240')).toBeVisible();
  await expect(page.getByText('Standard')).toBeVisible();
});

test('update display name successfully', async ({ page }) => {
  await page.getByLabel('Display Name').fill('Alice B.');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByDisplayValue('Alice B.')).toBeVisible();
});

test('success alert can be dismissed', async ({ page }) => {
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByRole('alert')).not.toBeVisible();
});

test('invalid email is rejected', async ({ page }) => {
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByText('Please enter a valid email address.')).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue('not-an-email');
});

test('valid email is accepted', async ({ page }) => {
  await page.getByLabel('Email').fill('alice.b@example.com');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue('alice.b@example.com');
});

test('switch XP configuration', async ({ page }) => {
  await page.getByLabel('XP Formula').selectOption({ label: 'Hard Mode' });
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('Active formula: Hard Mode')).toBeVisible();
});
```

- [ ] **Step 2: Run the tests**

```bash
XDG_CACHE_HOME=/tmp/claude-1001/cache bunx playwright test e2e/uc-6.spec.ts
```
Expected: all 6 tests pass. Note: the Dismiss button uses `aria-label="Dismiss"` in the component — the `getByRole('button', { name: 'Dismiss' })` should find it.

- [ ] **Step 3: Commit**

```bash
git add e2e/uc-6.spec.ts
git commit -m "test(e2e): UC-6 profile scenarios"
```

---

## Task 9: UC-7 — Edge Cases

**Files:**
- Create: `e2e/uc-7.spec.ts`

Note: The "future timestamp is rejected" scenario is tested via `page.evaluate()` calling the store's `recordCompletion` with the `recordCompletionWithTimestamp` guard. Since the guard throws for future timestamps, it is covered by the unit tests in `src/store/index.test.ts`. The E2E test here verifies the happy path (normal completion not blocked) and the malformed recurrence degradation.

- [ ] **Step 1: Create `e2e/uc-7.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { today, waitForApp, seedAndReload, makeChore } from './helpers/idb';

const MALFORMED_CHORE = {
  key: 'personal/broken-chore',
  choreId: 'broken-chore',
  packId: 'personal',
  title: 'Broken chore',
  xpSize: 'S',
  // Missing startDate to trigger malformed recurrence guard
  recurrence: { frequency: 'daily', interval: 1, startDate: '', windowStartTime: '00:00' },
  repeatable: false,
  active: true,
  createdAt: new Date().toISOString(),
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await seedAndReload(page, {
    chores: [
      MALFORMED_CHORE,
      makeChore({ choreId: 'morning-run', title: 'Morning run',
        recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' } }),
    ],
  });
});

test('malformed chore appears on dashboard without crashing', async ({ page }) => {
  await expect(page.getByTestId('chore-card').filter({ hasText: 'Broken chore' })).toBeVisible();
  await expect(page.getByTestId('chore-card').filter({ hasText: 'Morning run' })).toBeVisible();
  // Page heading still renders — no crash
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('malformed chore shows no overdue or due badge', async ({ page }) => {
  const card = page.getByTestId('chore-card').filter({ hasText: 'Broken chore' });
  await expect(card.getByText('Overdue')).not.toBeVisible();
  await expect(card.getByText('Due')).not.toBeVisible();
  // It should fall back to Upcoming
  await expect(card.getByText('Upcoming')).toBeVisible();
});

test('valid completion goes through and adds XP', async ({ page }) => {
  const xpBadge = page.locator('nav').getByText(/XP/);
  const xpBefore = await xpBadge.textContent();

  const card = page.getByTestId('chore-card').filter({ hasText: 'Morning run' });
  await card.getByRole('button', { name: 'Complete' }).click();
  await expect(card.getByText('Completed')).toBeVisible();

  const xpAfter = await xpBadge.textContent();
  expect(xpAfter).not.toBe(xpBefore);
});
```

- [ ] **Step 2: Run the tests**

```bash
XDG_CACHE_HOME=/tmp/claude-1001/cache bunx playwright test e2e/uc-7.spec.ts
```
Expected: all 3 tests pass.

- [ ] **Step 3: Run the full suite**

```bash
XDG_CACHE_HOME=/tmp/claude-1001/cache bunx playwright test
```
Expected: all tests in `e2e/` pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/uc-7.spec.ts
git commit -m "test(e2e): UC-7 edge case scenarios"
```

---

## Self-Review

**Spec coverage:**
- UC-1 (6 scenarios) → Task 2 ✓
- UC-2 (6 scenarios) → Task 3 ✓
- UC-2b (3 scenarios) → Task 4 ✓
- UC-3 (4 scenarios) → Task 5 ✓
- UC-4 (8 scenarios) → Task 6 ✓
- UC-5 (9 scenarios) → Task 7 ✓
- UC-6 (6 scenarios) → Task 8 ✓
- UC-7 (3 E2E scenarios; future-timestamp guard covered by existing unit test in `src/store/index.test.ts`) → Task 9 ✓

**Type consistency:**
- `makeChore` returns `Record<string, unknown>` with the `key` computed from `packId`+`choreId` — consistent with how `seedDatabase` receives data.
- `makeCompletion` returns an object with all required `Completion` fields.
- `seedDatabase` opens `tasks-harmony` at version 1 — matches `src/db/index.ts`.
- Question IDs in UC-5 are string constants reused consistently across the file.

**Potential issue — ENUM programmatic test (UC-5):** The `page.evaluate` approach to force an invalid ENUM value may not trigger React's synthetic `onChange` correctly. If this test is flaky, replace with a unit-level test asserting `validateAnswer` rejects the value. The existing `src/questions/validation.test.ts` is the right place.
