# Sprint: Debugging & Minor Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three improvements in parallel streams: a cross-browser e2e matrix with a proper PWA test (#25), a Repetition Factor UI replacing the Weight input (#28), and a clickable Chore Details page (#29).

**Architecture:** Streams A (#25) and B (#28) are fully independent and should be dispatched in parallel. Stream C (#29) follows once A and B are merged. Each stream is a self-contained set of file changes with its own tests.

**Tech Stack:** React 19, React Router v7, Zustand, IndexedDB via `idb`, Playwright 1.60, Bun test, Tailwind CSS 4, TypeScript, GitHub Actions.

---

## File Map

### Stream A — #25 Browser Matrix
| File | Action |
|---|---|
| `e2e/pwa-installability.spec.ts` | Rewrite — cross-browser prereq check + Chromium CDP check |
| `playwright.config.ts` | Modify — remove hardcoded `browserName`, add `projects` |
| `.github/workflows/ci.yml` | Modify — split `check` from `e2e`, add browser matrix |

### Stream B — #28 Repetition Factor
| File | Action |
|---|---|
| `src/xp/xpPreview.ts` | Modify — new `buildMultiplierXPPreview(repetitionFactor)` + export `toRepetitionFactor` |
| `src/xp/xpPreview.test.ts` | Modify — update `buildMultiplierXPPreview` tests |
| `src/db/index.ts` | Modify — bump `DB_VERSION` to 3, add migration, export `migrateXpPerUnit` |
| `src/db/index.test.ts` | Modify — add `migrateXpPerUnit` unit tests |
| `src/components/chores/choreFormValidation.ts` | Modify — fix NaN guard, update error message |
| `src/components/chores/choreFormValidation.test.ts` | Create — new unit tests for validation |
| `src/components/questions/QuestionFormFields.tsx` | Modify — Weight → Repetition Factor input |
| `src/components/completion/AnswerField.tsx` | Modify — update multiplier hint display |

### Stream C — #29 Chore Details Page
| File | Action |
|---|---|
| `e2e/chore-details.spec.ts` | Create — e2e tests for details page |
| `src/components/chores/ChorePage.tsx` | Create — details page component |
| `src/App.tsx` | Modify — add `/chores/:encodedChoreKey` route, redirect from `/completions` |
| `src/components/dashboard/ChoreCard.tsx` | Modify — remove Completions link, wrap left content in `<Link>` |
| `src/questions/display.test.ts` | Create — move tests from CompletionsPage.test.ts |
| `src/components/completion/CompletionsPage.tsx` | Delete |
| `src/components/completion/CompletionsPage.test.ts` | Delete |

---

## Stream A — #25: Browser Matrix

### Task 1: Rewrite pwa-installability.spec.ts for cross-browser

**Files:**
- Modify: `e2e/pwa-installability.spec.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
import { test, expect, type Page } from '@playwright/test';

type InstallabilityError = {
  errorId: string;
  errorArguments: Array<{ name: string; value: string }>;
};

// Playwright runs in an isolated context that Chrome identifies as incognito.
// That prevents install prompts in the browser UI but is not a configuration
// defect — filter it so the test focuses on real PWA setup errors.
const TEST_ENV_ERRORS = new Set(['in-incognito']);

async function checkPrerequisites(page: Page): Promise<void> {
  // .href on HTMLLinkElement is always absolute, so we get a fully-resolved URL.
  const manifestHref = await page.evaluate(() =>
    document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ?? null,
  );
  expect(manifestHref, 'Page must include <link rel="manifest">').not.toBeNull();

  const manifestResponse = await page.request.get(manifestHref!);
  expect(manifestResponse.status(), 'Manifest must return HTTP 200').toBe(200);

  const manifest = await manifestResponse.json() as {
    name?: string;
    start_url?: string;
    display?: string;
    icons?: Array<{ src: string; sizes?: string }>;
  };
  expect(manifest.name, 'Manifest must have name').toBeTruthy();
  expect(manifest.start_url, 'Manifest must have start_url').toBeTruthy();
  expect(manifest.display, 'Manifest must have display').toBeTruthy();

  const hasLargeIcon = (manifest.icons ?? []).some((icon) =>
    (icon.sizes ?? '').split(' ').some((s) => {
      const [w] = s.split('x').map(Number);
      return w >= 192;
    }),
  );
  expect(hasLargeIcon, 'Manifest must have an icon with sizes >= 192').toBe(true);

  // Resolve icon srcs against the manifest URL so we test the actual server-delivered URLs.
  const manifestUrl = new URL(manifestHref!);
  for (const icon of manifest.icons ?? []) {
    const iconUrl = new URL(icon.src, manifestUrl).toString();
    const iconResponse = await page.request.get(iconUrl);
    expect(iconResponse.status(), `Icon ${icon.src} must return HTTP 200`).toBe(200);
    const contentType = iconResponse.headers()['content-type'] ?? '';
    expect(contentType, `Icon ${icon.src} must have content-type image/png`).toContain('image/png');
  }
}

test('PWA prerequisites are met', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', 'Firefox does not support PWAs');

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await checkPrerequisites(page);
});

test('PWA is installable by Chrome', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP installability check is Chromium-only');

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const client = await context.newCDPSession(page);
  const { installabilityErrors } = await client.send(
    'Page.getInstallabilityErrors',
  ) as { installabilityErrors: InstallabilityError[] };

  const configErrors = installabilityErrors.filter((e) => !TEST_ENV_ERRORS.has(e.errorId));

  expect(
    configErrors.map((e) => e.errorId),
    `PWA has installability errors: ${installabilityErrors.map((e) => e.errorId).join(', ')}`,
  ).toEqual([]);
});
```

- [ ] **Step 2: Run the test on chromium to confirm it still passes**

```bash
bunx playwright test pwa-installability --project=chromium
```

Expected: 2 passed (the test file now has 2 tests; both run on chromium since Firefox skip doesn't apply to chromium, and the CDP test also runs).

Wait — `PWA prerequisites are met` skips on Firefox only, runs on chromium. `PWA is installable by Chrome` skips on non-chromium, runs on chromium. Both should pass.

---

### Task 2: Add Playwright projects to playwright.config.ts

**Files:**
- Modify: `playwright.config.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

function findHeadlessShell(): string | undefined {
  const cacheHome = process.env.XDG_CACHE_HOME ?? path.join(process.env.HOME ?? '/root', '.cache');
  const base = path.join(cacheHome, 'ms-playwright');
  if (!fs.existsSync(base)) return undefined;
  const dirs = fs.readdirSync(base)
    .filter((d) => d.startsWith('chromium_headless_shell-'))
    .sort();
  if (dirs.length === 0) return undefined;
  const candidate = path.join(
    base, dirs.at(-1)!, 'chrome-headless-shell-linux64', 'chrome-headless-shell',
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
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? findHeadlessShell(),
          chromiumSandbox: false,
          args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-setuid-sandbox'],
        },
      },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
```

- [ ] **Step 2: Install firefox and webkit locally if not present**

```bash
bunx playwright install --with-deps firefox webkit
```

Expected: Downloads browsers (or "already installed" messages).

- [ ] **Step 3: Run full e2e suite on all three browsers**

```bash
bun run test:e2e
```

Expected: All tests pass for chromium and webkit. Firefox tests pass (PWA prerequisites test skips gracefully, other tests run normally). Note: webkit on Linux may have minor rendering differences but functional tests should pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/pwa-installability.spec.ts playwright.config.ts
git commit -m "feat: cross-browser e2e matrix with multi-browser PWA test (#25)"
```

---

### Task 3: Update ci.yml with e2e browser matrix

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace the file contents**

```yaml
name: CI

on:
  push:
    branches-ignore: [main]
  workflow_call:
    outputs:
      artifact-id:
        description: "GitHub artifact ID of the production build"
        value: ${{ jobs.build.outputs.artifact-id }}

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1

      - name: Install dependencies
        run: bun install

      - name: Typecheck
        run: bun run typecheck

      - name: Unit tests
        run: bun run test

  e2e:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        browser: [chromium, firefox, webkit]
    steps:
      - uses: actions/checkout@v6

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1

      - name: Install dependencies
        run: bun install

      - name: Install Playwright browser
        run: bunx playwright install --with-deps ${{ matrix.browser }}

      - name: E2E tests
        run: bunx playwright test --project=${{ matrix.browser }}

  build:
    needs: [check, e2e]
    runs-on: ubuntu-latest
    outputs:
      artifact-id: ${{ steps.upload.outputs.artifact-id }}
    steps:
      - uses: actions/checkout@v6

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1

      - name: Install dependencies
        run: bun install

      - name: Build
        run: bun run build

      - name: Upload build artifact
        id: upload
        uses: actions/upload-artifact@v7
        with:
          name: build
          path: dist/
          retention-days: 7
          if-no-files-found: error
```

- [ ] **Step 2: Commit and push to trigger CI**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run e2e tests in parallel across chromium, firefox, webkit (#25)"
git push public HEAD
```

Expected: CI runs three parallel `e2e` jobs (chromium, firefox, webkit), each installing only its own browser. Check the Actions tab to confirm all three legs pass.

---

## Stream B — #28: Repetition Factor

### Task 4: Update xpPreview.ts — new signature and utility (TDD)

**Files:**
- Modify: `src/xp/xpPreview.ts`
- Modify: `src/xp/xpPreview.test.ts`

- [ ] **Step 1: Update the `buildMultiplierXPPreview` tests to reflect the new signature**

Replace the `describe('buildMultiplierXPPreview', ...)` block in `src/xp/xpPreview.test.ts`:

```typescript
describe('buildMultiplierXPPreview', () => {
  it('shows ÷1 for repetition factor 1', () => {
    expect(buildMultiplierXPPreview(1)).toBe('÷1 per unit answered');
  });

  it('shows ÷2 for repetition factor 2', () => {
    expect(buildMultiplierXPPreview(2)).toBe('÷2 per unit answered');
  });

  it('shows ÷5 for repetition factor 5', () => {
    expect(buildMultiplierXPPreview(5)).toBe('÷5 per unit answered');
  });
});
```

Also add tests for `toRepetitionFactor` at the end of the file:

```typescript
import { buildXPPreview, buildMultiplierXPPreview, toRepetitionFactor } from './xpPreview';

// ... existing describe blocks ...

describe('toRepetitionFactor', () => {
  it('returns 1 for xpPerUnit of 1', () => {
    expect(toRepetitionFactor(1)).toBe(1);
  });

  it('returns 2 for xpPerUnit of 0.5', () => {
    expect(toRepetitionFactor(0.5)).toBe(2);
  });

  it('returns 4 for xpPerUnit of 0.25', () => {
    expect(toRepetitionFactor(0.25)).toBe(4);
  });

  it('returns 1 for xpPerUnit >= 1 (legacy boost values clamp to 1)', () => {
    expect(toRepetitionFactor(2)).toBe(1);
    expect(toRepetitionFactor(1.5)).toBe(1);
  });

  it('returns 1 for xpPerUnit <= 0 or NaN (safe defaults)', () => {
    expect(toRepetitionFactor(0)).toBe(1);
    expect(toRepetitionFactor(-1)).toBe(1);
    expect(toRepetitionFactor(NaN)).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun test src/xp/xpPreview.test.ts
```

Expected: FAIL — `buildMultiplierXPPreview` returns `×1` not `÷1`, and `toRepetitionFactor` is not exported.

- [ ] **Step 3: Update `src/xp/xpPreview.ts`**

```typescript
import type { XPSize, XPSettings } from '@/types';
import { XP_BASE } from './calculator';

export function buildXPPreview(xpSize: XPSize, settings: XPSettings): string {
  const base = XP_BASE[xpSize];
  const max = Math.round(base * settings.maxStreakMultiplier);
  if (max === base) return `${base} XP`;
  return `${base} XP · up to ${max} XP at max streak`;
}

export function toRepetitionFactor(xpPerUnit: number): number {
  if (!Number.isFinite(xpPerUnit) || xpPerUnit <= 0) return 1;
  return Math.max(1, Math.round(1 / xpPerUnit));
}

export function buildMultiplierXPPreview(repetitionFactor: number): string {
  return `÷${repetitionFactor} per unit answered`;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
bun test src/xp/xpPreview.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/xp/xpPreview.ts src/xp/xpPreview.test.ts
git commit -m "feat: replace buildMultiplierXPPreview weight arg with repetitionFactor, add toRepetitionFactor (#28)"
```

---

### Task 5: Add migrateXpPerUnit to db/index.ts and bump DB_VERSION (TDD)

**Files:**
- Modify: `src/db/index.ts`
- Modify: `src/db/index.test.ts`

- [ ] **Step 1: Write failing tests for `migrateXpPerUnit` in `src/db/index.test.ts`**

Add at the end of the file:

```typescript
import { openDB, getPacks, getProfile, getXPSettings, getSyncState, migrateXpPerUnit } from './index';

// ... existing describe('DB', ...) block unchanged ...

describe('migrateXpPerUnit', () => {
  it('leaves xpPerUnit = 1 unchanged', () => {
    expect(migrateXpPerUnit(1)).toBe(1);
  });

  it('leaves xpPerUnit > 1 unchanged', () => {
    expect(migrateXpPerUnit(2)).toBe(2);
    expect(migrateXpPerUnit(1.5)).toBe(1.5);
  });

  it('converts xpPerUnit = 0.5 to 1/round(2) = 0.5 (unchanged, already exact)', () => {
    expect(migrateXpPerUnit(0.5)).toBeCloseTo(0.5);
  });

  it('converts xpPerUnit = 0.25 to 1/round(4) = 0.25 (unchanged, already exact)', () => {
    expect(migrateXpPerUnit(0.25)).toBeCloseTo(0.25);
  });

  it('rounds 0.4 to nearest integer factor: round(1/0.4)=round(2.5)=3, result=1/3', () => {
    expect(migrateXpPerUnit(0.4)).toBeCloseTo(1 / 3);
  });

  it('rounds 0.9 to nearest integer factor: round(1/0.9)=round(1.11)=1, result=1', () => {
    expect(migrateXpPerUnit(0.9)).toBeCloseTo(1);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun test src/db/index.test.ts
```

Expected: FAIL — `migrateXpPerUnit` is not exported.

- [ ] **Step 3: Add `migrateXpPerUnit` and bump `DB_VERSION` in `src/db/index.ts`**

Change `DB_VERSION = 2` to `DB_VERSION = 3`.

Add the exported function before `openDB`:

```typescript
export function migrateXpPerUnit(xpPerUnit: number): number {
  return xpPerUnit < 1 ? 1 / Math.round(1 / xpPerUnit) : xpPerUnit;
}
```

Update the `upgrade` callback to add the v3 migration. Change the signature from `upgrade(db, oldVersion)` to `upgrade(db, oldVersion, _newVersion, transaction)` and add:

```typescript
if (oldVersion < 3) {
  void (async () => {
    const store = transaction.objectStore('questions');
    const questions = await store.getAll();
    for (const q of questions) {
      if ((q as { type: string }).type === 'MULTIPLIER') {
        const mq = q as { xpPerUnit: number; [key: string]: unknown };
        await store.put({ ...mq, xpPerUnit: migrateXpPerUnit(mq.xpPerUnit) });
      }
    }
  })();
}
```

The full updated `openDB` function:

```typescript
export async function openDB(
  name = DB_NAME,
): Promise<IDBPDatabase<TasksHarmonyDB>> {
  const db = await idbOpen<TasksHarmonyDB>(name, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        db.createObjectStore('packs', { keyPath: 'id' });

        const chores = db.createObjectStore('chores', { keyPath: 'key' });
        chores.createIndex('by-pack', 'packId');

        const questions = db.createObjectStore('questions', { keyPath: 'id' });
        questions.createIndex('by-chore', 'choreKey');

        const completions = db.createObjectStore('completions', { keyPath: 'id' });
        completions.createIndex('by-chore', 'choreKey');
        completions.createIndex('by-date', 'completedAt');

        db.createObjectStore('xpSettings', { keyPath: 'id' });
        db.createObjectStore('profile', { keyPath: 'id' });
        db.createObjectStore('syncState', { keyPath: 'id' });
      }
      if (oldVersion < 2) {
        const qas = db.createObjectStore('quickAnswerSets', { keyPath: 'id' });
        qas.createIndex('by-chore', 'choreKey');
      }
      if (oldVersion < 3) {
        void (async () => {
          const store = transaction.objectStore('questions');
          const questions = await store.getAll();
          for (const q of questions) {
            if ((q as { type: string }).type === 'MULTIPLIER') {
              const mq = q as { xpPerUnit: number; [key: string]: unknown };
              await store.put({ ...mq, xpPerUnit: migrateXpPerUnit(mq.xpPerUnit) });
            }
          }
        })();
      }
    },
  });
  await seed(db);
  return db;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
bun test src/db/index.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/db/index.ts src/db/index.test.ts
git commit -m "feat: DB v3 migration — convert xpPerUnit < 1 to nearest repetition factor (#28)"
```

---

### Task 6: Update choreFormValidation — NaN guard and error message (TDD)

**Files:**
- Create: `src/components/chores/choreFormValidation.test.ts`
- Modify: `src/components/chores/choreFormValidation.ts`

- [ ] **Step 1: Create `src/components/chores/choreFormValidation.test.ts`**

```typescript
import { describe, it, expect } from 'bun:test';
import { validateQuestionDrafts } from './choreFormValidation';

const baseMultiplier = {
  id: 'q-1',
  choreKey: 'personal/test',
  prompt: 'How many?',
  required: true as const,
  order: 0,
  type: 'MULTIPLIER' as const,
  multiplierAnswerType: 'integer' as const,
};

describe('validateQuestionDrafts — MULTIPLIER', () => {
  it('accepts xpPerUnit = 1 (repetition factor 1)', () => {
    expect(validateQuestionDrafts([{ ...baseMultiplier, xpPerUnit: 1 }])).toBeNull();
  });

  it('accepts xpPerUnit = 0.5 (repetition factor 2)', () => {
    expect(validateQuestionDrafts([{ ...baseMultiplier, xpPerUnit: 0.5 }])).toBeNull();
  });

  it('rejects xpPerUnit = 0', () => {
    expect(validateQuestionDrafts([{ ...baseMultiplier, xpPerUnit: 0 }])).toBe(
      'Repetition factor must be a whole number of 1 or more',
    );
  });

  it('rejects xpPerUnit = NaN', () => {
    expect(validateQuestionDrafts([{ ...baseMultiplier, xpPerUnit: NaN }])).toBe(
      'Repetition factor must be a whole number of 1 or more',
    );
  });

  it('rejects more than one multiplier', () => {
    const drafts = [
      { ...baseMultiplier, id: 'q-1', xpPerUnit: 0.5 },
      { ...baseMultiplier, id: 'q-2', xpPerUnit: 0.33 },
    ];
    expect(validateQuestionDrafts(drafts)).toBe(
      'Only one score multiplier question is allowed per chore',
    );
  });

  it('ignores deleted drafts', () => {
    expect(
      validateQuestionDrafts([{ ...baseMultiplier, xpPerUnit: NaN, _deleted: true }]),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun test src/components/chores/choreFormValidation.test.ts
```

Expected: FAIL on the NaN test — current code uses `xpPerUnit <= 0` which is `false` for NaN.

- [ ] **Step 3: Update `src/components/chores/choreFormValidation.ts`**

Replace the inner MULTIPLIER check:

```typescript
if (draft.type === 'MULTIPLIER') {
  if (!Number.isFinite(draft.xpPerUnit) || draft.xpPerUnit <= 0) {
    return 'Repetition factor must be a whole number of 1 or more';
  }
  continue;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
bun test src/components/chores/choreFormValidation.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/chores/choreFormValidation.ts src/components/chores/choreFormValidation.test.ts
git commit -m "feat: update multiplier validation for repetition factor, fix NaN guard (#28)"
```

---

### Task 7: Update QuestionFormFields — Weight → Repetition Factor

**Files:**
- Modify: `src/components/questions/QuestionFormFields.tsx`

- [ ] **Step 1: Update the import at the top of the file**

Change:
```typescript
import { buildMultiplierXPPreview } from '@/xp/xpPreview';
```

To:
```typescript
import { buildMultiplierXPPreview, toRepetitionFactor } from '@/xp/xpPreview';
```

- [ ] **Step 2: Replace the MULTIPLIER weight block (lines 189–208)**

Replace:
```tsx
{question.type === 'MULTIPLIER' && (
  <>
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">
        Weight <span className="text-red-500">*</span>
      </label>
      <input
        type="number"
        value={question.xpPerUnit}
        min="0.0001"
        step="any"
        onChange={(e) => update({ xpPerUnit: Number(e.target.value) } as Partial<DraftQuestion>)}
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
      {question.xpPerUnit > 0 && (
        <p className="mt-1 text-xs text-indigo-600">
          {buildMultiplierXPPreview(question.xpPerUnit)}
        </p>
      )}
    </div>
```

With:
```tsx
{question.type === 'MULTIPLIER' && (
  <>
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">
        Repetition Factor <span className="text-red-500">*</span>
      </label>
      <input
        type="number"
        value={toRepetitionFactor(question.xpPerUnit)}
        min="1"
        step="1"
        onChange={(e) => {
          const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
          update({ xpPerUnit: 1 / n } as Partial<DraftQuestion>);
        }}
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
      <p className="mt-1 text-xs text-indigo-600">
        {buildMultiplierXPPreview(toRepetitionFactor(question.xpPerUnit))}
      </p>
    </div>
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/questions/QuestionFormFields.tsx
git commit -m "feat: replace Weight input with Repetition Factor in Score Multiplier (#28)"
```

---

### Task 8: Update AnswerField — update multiplier hint

**Files:**
- Modify: `src/components/completion/AnswerField.tsx`

- [ ] **Step 1: Update the import**

Add `toRepetitionFactor` to the import at the top:

```typescript
import { toRepetitionFactor } from '@/xp/xpPreview';
```

- [ ] **Step 2: Replace the multiplier hint (lines 85–87)**

Change:
```tsx
<p className="mt-1 text-xs text-gray-500">
  × {String(question.xpPerUnit).replace(/\.?0+$/, '')}
</p>
```

To:
```tsx
<p className="mt-1 text-xs text-gray-500">
  ÷ {toRepetitionFactor(question.xpPerUnit)}
</p>
```

- [ ] **Step 3: Run all unit tests**

```bash
bun run test
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/completion/AnswerField.tsx
git commit -m "feat: update AnswerField multiplier hint to show ÷repetitionFactor (#28)"
```

---

## Stream C — #29: Chore Details Page

*(Start after Streams A and B are complete and merged to the branch.)*

### Task 9: Write failing e2e test for the Chore Details page

**Files:**
- Create: `e2e/chore-details.spec.ts`

- [ ] **Step 1: Create the test file**

```typescript
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
  await page.getByTestId('chore-card').filter({ hasText: 'Walk the dog' }).locator('h3').click();
  await expect(page).toHaveURL(/\/chores\/.+/);
  await expect(page.getByRole('heading', { level: 1, name: 'Walk the dog' })).toBeVisible();
});

test('details page shows full description without truncation', async ({ page }) => {
  await page.getByTestId('chore-card').filter({ hasText: 'Walk the dog' }).locator('h3').click();
  await expect(page.getByText('Full description visible only on the details page, not truncated.')).toBeVisible();
});

test('details page shows completion history', async ({ page }) => {
  await page.getByTestId('chore-card').filter({ hasText: 'Walk the dog' }).locator('h3').click();
  await expect(page.getByRole('columnheader', { name: 'Completed at' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '7' })).toBeVisible();
});

test('back button returns to previous page', async ({ page }) => {
  await page.getByTestId('chore-card').filter({ hasText: 'Walk the dog' }).locator('h3').click();
  await expect(page).toHaveURL(/\/chores\/.+/);
  await page.getByRole('button', { name: /Back/ }).click();
  await expect(page).toHaveURL('/');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bunx playwright test chore-details --project=chromium
```

Expected: FAIL — clicking `h3` does nothing (no link), route `/chores/:key` doesn't exist.

---

### Task 10: Create ChorePage component

**Files:**
- Create: `src/components/chores/ChorePage.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import { getAnswerDisplay } from '@/questions/display';

export default function ChorePage() {
  const { encodedChoreKey } = useParams<{ encodedChoreKey: string }>();
  const navigate = useNavigate();

  const choreKey = encodedChoreKey ? decodeURIComponent(encodedChoreKey) : '';
  const chores = useAppStore((s) => s.chores);
  const allCompletions = useAppStore((s) => s.completions);
  const questions = useAppStore((s) => s.questions);

  const chore = chores.find((c) => c.key === choreKey);
  if (!chore) return <Navigate to="/" replace />;

  const choreQuestions = questions
    .filter((q) => q.choreKey === choreKey)
    .sort((a, b) => a.order - b.order);

  const completions = allCompletions
    .filter((c) => c.choreKey === choreKey)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString();
  }

  return (
    <div className="py-4">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 text-sm text-blue-600 hover:underline"
      >
        ← Back
      </button>

      <h1 className="mb-2 text-2xl font-bold text-gray-900">{chore.title}</h1>

      {chore.description && (
        <p className="mb-4 text-sm text-gray-600">{chore.description}</p>
      )}

      <h2 className="mb-3 text-lg font-semibold text-gray-800">Completion History</h2>

      {completions.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No completions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Completed at</th>
                {choreQuestions.map((q) => (
                  <th key={q.id} className="py-2 pr-4 font-medium text-gray-700">{q.prompt}</th>
                ))}
                <th className="py-2 font-medium text-gray-700 text-right">XP earned</th>
              </tr>
            </thead>
            <tbody>
              {completions.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{formatDate(c.completedAt)}</td>
                  {choreQuestions.map((q) => (
                    <td key={q.id} className="py-2 pr-4 text-gray-600">
                      {getAnswerDisplay(c.answers, q)}
                    </td>
                  ))}
                  <td className="py-2 text-gray-700 font-medium text-right">{c.xpEarned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: No errors.

---

### Task 11: Wire ChorePage into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace the CompletionsPage import with ChorePage**

Remove:
```typescript
import CompletionsPage from '@/components/completion/CompletionsPage';
```

Add:
```typescript
import ChorePage from '@/components/chores/ChorePage';
```

- [ ] **Step 2: Update the react-router-dom import on line 2 to add `useParams` and `Navigate`**

Change:
```typescript
import { Routes, Route, Link } from 'react-router-dom';
```

To:
```typescript
import { Routes, Route, Link, useParams, Navigate } from 'react-router-dom';
```

Then add a redirect helper component just above the `App` function definition:

```typescript
function RedirectToChore() {
  const { encodedChoreKey } = useParams<{ encodedChoreKey: string }>();
  return <Navigate to={`/chores/${encodedChoreKey}`} replace />;
}
```

- [ ] **Step 3: Replace the routes block (lines 135–140)**

```tsx
<Routes>
  <Route path="/" element={<Dashboard />} />
  <Route path="/packs/:packId" element={<PackDashboard />} />
  <Route path="/chores/:encodedChoreKey" element={<ChorePage />} />
  <Route path="/chores/:encodedChoreKey/completions" element={<RedirectToChore />} />
  <Route path="/profile" element={<ProfilePage />} />
</Routes>
```

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 5: Run the e2e tests to confirm navigation now works**

```bash
bunx playwright test chore-details --project=chromium
```

Expected: "clicking chore card title" still fails (ChoreCard hasn't been updated yet), but the other tests that navigate directly to the URL might pass if the route exists. It's fine — proceed to Task 12.

---

### Task 12: Update ChoreCard — remove Completions link, make left area clickable

**Files:**
- Modify: `src/components/dashboard/ChoreCard.tsx`

- [ ] **Step 1: The `Link` import is already present — verify it at the top**

Line 2: `import { Link } from 'react-router-dom';` — already there. No import change needed.

- [ ] **Step 2: Replace the card body structure**

In the JSX, find the inner `<div className="flex items-start justify-between gap-3">` block. Replace the left content `<div className="min-w-0 flex-1">` with a `<Link>`:

Replace:
```tsx
<div className="min-w-0 flex-1">
  <div className="mb-1 flex flex-wrap items-center gap-2">
    <h3 className="font-semibold text-gray-900 leading-tight">{chore.title}</h3>
    <StatusBadge status={status} />
  </div>

  {packTitle && (
    <p className="text-xs text-gray-400">{packTitle}</p>
  )}

  {chore.description && (
    <p className="mb-2 text-sm text-gray-500 line-clamp-2">{chore.description}</p>
  )}

  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
    <span><span className="font-medium text-gray-700">{effectiveXP}</span> XP</span>
    {currentStreak > 0 && (
      <span>Streak: <span className="font-medium text-gray-700">{currentStreak}</span></span>
    )}
    <span>{formatRecurrence(chore.recurrence)}</span>
  </div>
</div>
```

With:
```tsx
<Link
  to={`/chores/${encodeURIComponent(chore.key)}`}
  className="min-w-0 flex-1 block"
>
  <div className="mb-1 flex flex-wrap items-center gap-2">
    <h3 className="font-semibold text-gray-900 leading-tight">{chore.title}</h3>
    <StatusBadge status={status} />
  </div>

  {packTitle && (
    <p className="text-xs text-gray-400">{packTitle}</p>
  )}

  {chore.description && (
    <p className="mb-2 text-sm text-gray-500 line-clamp-2">{chore.description}</p>
  )}

  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
    <span><span className="font-medium text-gray-700">{effectiveXP}</span> XP</span>
    {currentStreak > 0 && (
      <span>Streak: <span className="font-medium text-gray-700">{currentStreak}</span></span>
    )}
    <span>{formatRecurrence(chore.recurrence)}</span>
  </div>
</Link>
```

- [ ] **Step 3: Remove the Completions link from the action button group**

Find and remove:
```tsx
<Link
  to={`/chores/${encodeURIComponent(chore.key)}/completions`}
  className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
  title="View completions"
>
  Completions
</Link>
```

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 5: Run all e2e tests on chromium**

```bash
bunx playwright test --project=chromium
```

Expected: All tests pass including the new `chore-details` suite.

- [ ] **Step 6: Commit**

```bash
git add src/components/chores/ChorePage.tsx src/App.tsx src/components/dashboard/ChoreCard.tsx
git commit -m "feat: add Chore Details page at /chores/:key, make card body clickable (#29)"
```

---

### Task 13: Clean up — move display test, delete CompletionsPage files

**Files:**
- Create: `src/questions/display.test.ts`
- Delete: `src/components/completion/CompletionsPage.tsx`
- Delete: `src/components/completion/CompletionsPage.test.ts`

- [ ] **Step 1: Create `src/questions/display.test.ts` with the moved test content**

```typescript
import { describe, expect, it } from 'bun:test';
import type { EnumQuestion, EnumChoice } from '@/types';
import { getAnswerDisplay } from './display';

const choice: EnumChoice = { id: 'uuid-1', label: 'High', order: 0 };
const q: EnumQuestion = {
  id: 'q-1',
  choreKey: 'personal/test',
  prompt: 'Effort?',
  type: 'ENUM',
  required: true,
  order: 0,
  choices: [choice],
};

describe('getAnswerDisplay', () => {
  it('shows label when the stored UUID matches a choice', () => {
    expect(getAnswerDisplay([{ questionId: 'q-1', value: 'uuid-1' }], q)).toBe('High');
  });

  it('falls back to raw value when UUID has no matching choice', () => {
    expect(getAnswerDisplay([{ questionId: 'q-1', value: 'unknown-uuid' }], q)).toBe('unknown-uuid');
  });

  it('returns empty string when answer is absent', () => {
    expect(getAnswerDisplay([], q)).toBe('');
  });
});
```

- [ ] **Step 2: Run unit tests to confirm the moved test passes**

```bash
bun test src/questions/display.test.ts
```

Expected: 3 passed.

- [ ] **Step 3: Delete the old files**

```bash
rm src/components/completion/CompletionsPage.tsx
rm src/components/completion/CompletionsPage.test.ts
```

- [ ] **Step 4: Run full test suite to confirm nothing is broken**

```bash
bun run test && bun run typecheck
```

Expected: All unit tests pass, no TypeScript errors.

- [ ] **Step 5: Run full e2e suite on all three browsers**

```bash
bun run test:e2e
```

Expected: All tests pass across chromium, firefox, webkit.

- [ ] **Step 6: Final commit**

```bash
git add src/questions/display.test.ts
git rm src/components/completion/CompletionsPage.tsx src/components/completion/CompletionsPage.test.ts
git commit -m "refactor: delete CompletionsPage, move getAnswerDisplay test to questions/ (#29)"
```

---

## Final Verification

- [ ] Run `bun run test` — all unit tests green
- [ ] Run `bun run typecheck` — no errors
- [ ] Run `bun run test:e2e` — all three browser projects pass
- [ ] Push branch and confirm CI matrix runs three parallel `e2e` jobs
