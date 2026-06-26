# Issues Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users view archived chores (those with `active: false`) by toggling an archive mode in the Dashboard and PackDashboard views.

**Architecture:** A new `useArchiveMode` hook (mirrors `useCompactMode`) persists the toggle in localStorage. `Dashboard.tsx` reads this hook and switches its chore filter between `active: true` (normal) and `active: false` (archive mode). A new dropdown menu item triggers the toggle. No database schema changes needed — archived chores already exist in IndexedDB.

**Tech Stack:** React, Zustand, Bun test, Playwright

---

## File Map

- Create: `src/hooks/useArchiveMode.ts` — localStorage-backed toggle hook
- Modify: `src/components/dashboard/Dashboard.tsx` — import hook, switch filter, add menu item, update empty state, hide "+ New Chore" in archive mode
- Modify: `src/components/dashboard/Dashboard.test.ts` — unit tests for `archiveMenuLabel`
- Create: `e2e/uc-archive.spec.ts` — e2e tests for archive mode toggle

---

### Task 1: `useArchiveMode` hook

**Files:**
- Create: `src/hooks/useArchiveMode.ts`
- Test: `src/hooks/useArchiveMode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useArchiveMode.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { resolveInitialArchiveMode } from './useArchiveMode';

describe('resolveInitialArchiveMode', () => {
  it('returns false when storage is null', () => {
    expect(resolveInitialArchiveMode(null)).toBe(false);
  });
  it('returns true when storage is "true"', () => {
    expect(resolveInitialArchiveMode('true')).toBe(true);
  });
  it('returns false when storage is "false"', () => {
    expect(resolveInitialArchiveMode('false')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/hooks/useArchiveMode.test.ts
```

Expected: FAIL with `Cannot find module './useArchiveMode'`

- [ ] **Step 3: Create the hook**

Create `src/hooks/useArchiveMode.ts`:

```typescript
import { useState } from 'react';

export function resolveInitialArchiveMode(stored: string | null): boolean {
  return stored === 'true';
}

export function useArchiveMode() {
  const [archiveMode, setArchiveMode] = useState<boolean>(() =>
    resolveInitialArchiveMode(localStorage.getItem('archive-mode')),
  );

  function toggle() {
    setArchiveMode((a) => {
      const next = !a;
      localStorage.setItem('archive-mode', String(next));
      return next;
    });
  }

  return { archiveMode, toggle };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/hooks/useArchiveMode.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useArchiveMode.ts src/hooks/useArchiveMode.test.ts
git commit -m "feat: add useArchiveMode hook"
```

---

### Task 2: `archiveMenuLabel` unit-tested pure function

Add a pure, exported `archiveMenuLabel` function to `Dashboard.tsx` — same pattern as `compactMenuLabel` — so the label logic is independently testable.

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx:25-27`
- Modify: `src/components/dashboard/Dashboard.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/components/dashboard/Dashboard.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { compactMenuLabel, archiveMenuLabel } from './Dashboard';

describe('compactMenuLabel', () => {
  it('returns "Compact view" when not compact', () => {
    expect(compactMenuLabel(false)).toBe('Compact view');
  });
  it('returns "Normal view" when compact', () => {
    expect(compactMenuLabel(true)).toBe('Normal view');
  });
});

describe('archiveMenuLabel', () => {
  it('returns "View archived" when not in archive mode', () => {
    expect(archiveMenuLabel(false)).toBe('View archived');
  });
  it('returns "Exit archive" when in archive mode', () => {
    expect(archiveMenuLabel(true)).toBe('Exit archive');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/components/dashboard/Dashboard.test.ts
```

Expected: FAIL with `archiveMenuLabel is not exported`

- [ ] **Step 3: Add `archiveMenuLabel` to Dashboard.tsx**

In `src/components/dashboard/Dashboard.tsx`, after the existing `compactMenuLabel` function (after line 27), add:

```typescript
export function archiveMenuLabel(archiveMode: boolean): string {
  return archiveMode ? 'Exit archive' : 'View archived';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/components/dashboard/Dashboard.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/Dashboard.tsx src/components/dashboard/Dashboard.test.ts
git commit -m "feat: add archiveMenuLabel pure function with tests"
```

---

### Task 3: Wire archive mode into Dashboard

Update `Dashboard.tsx` to:
1. Import and use `useArchiveMode`
2. Switch the chore filter based on `archiveMode`
3. Add the archive toggle to the dropdown menu
4. Update the empty state message
5. Hide "+ New Chore" in archive mode

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx`

- [ ] **Step 1: Update imports and hook usage**

In `src/components/dashboard/Dashboard.tsx`, add the import at the top (after line 8):

```typescript
import { useArchiveMode } from '@/hooks/useArchiveMode';
```

Inside the `Dashboard` component, after the `useCompactMode` line (line 37):

```typescript
const { archiveMode, toggle: toggleArchiveMode } = useArchiveMode();
```

- [ ] **Step 2: Switch the chore filter**

Replace line 40:
```typescript
const activeChores = chores.filter((c) => c.active);
```
with:
```typescript
const visibleChores = chores.filter((c) => (archiveMode ? !c.active : c.active));
```

Also update line 42 (and the empty-state check at line 107) to use `visibleChores` instead of `activeChores`. Find every reference to `activeChores` in the file and replace it with `visibleChores`.

Line 42 becomes:
```typescript
const withStatus: Array<{ chore: Chore; status: ChoreStatus }> = visibleChores.map((chore) => {
```

Line 107 becomes:
```typescript
{visibleChores.length === 0 && (
  <div className="rounded-xl border border-dashed p-12 text-center">
    <p className="text-muted-foreground">{archiveMode ? 'No archived chores.' : 'No chores yet.'}</p>
    {!archiveMode && <p className="mt-1 text-sm text-muted-foreground">Add your first chore to get started.</p>}
  </div>
)}
```

- [ ] **Step 3: Update the toolbar**

Replace the `<div data-slot="button-group" ...>` block (lines 82–103) with the version that hides `+ New Chore` in archive mode and adds the archive toggle menu item:

```tsx
<div className={`flex items-center ${currentPackId ? 'ml-auto' : ''}`}>
  <div data-slot="button-group" className="flex">
    {!archiveMode && (
      <Button onClick={() => setShowNewChoreModal(true)} className="rounded-r-none">
        + New Chore
      </Button>
    )}
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          aria-label={compact ? 'Exit compact view' : 'Toggle compact view'}
          className={archiveMode ? 'rounded-md px-2' : 'rounded-l-none border-l border-primary-foreground/20 px-2'}
        >
          ⌄
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={toggleCompact} className="flex items-center gap-2">
          <span>{compact ? '⊞' : '⊟'}</span>
          <span>{compactMenuLabel(compact)}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={toggleArchiveMode} className="flex items-center gap-2">
          <span>{archiveMode ? '↩' : '🗄'}</span>
          <span>{archiveMenuLabel(archiveMode)}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</div>
```

- [ ] **Step 4: Run unit tests**

```bash
bun test src/components/dashboard/Dashboard.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/Dashboard.tsx
git commit -m "feat: wire archive mode toggle into Dashboard"
```

---

### Task 4: E2e test for archive mode

**Files:**
- Create: `e2e/uc-archive.spec.ts`

- [ ] **Step 1: Write the failing e2e test**

Create `e2e/uc-archive.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { today, waitForApp, seedAndReload, makeChore } from './helpers/idb';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  await seedAndReload(page, {
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
  await seedAndReload(page, {
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
XDG_CACHE_HOME=/tmp/pw-cache node_modules/.bin/playwright test e2e/uc-archive.spec.ts
```

Expected: FAIL — archive mode menu item not found

- [ ] **Step 3: Run the full e2e suite to verify no regressions**

After the Dashboard changes pass the archive tests:

```bash
XDG_CACHE_HOME=/tmp/pw-cache node_modules/.bin/playwright test
```

Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add e2e/uc-archive.spec.ts
git commit -m "test(e2e): add archive mode e2e tests"
```
