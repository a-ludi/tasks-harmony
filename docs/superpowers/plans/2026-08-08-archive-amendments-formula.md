# Archive UI, Amend Completions & Streak Formula Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement issues #64 (streak shown as percent in XP formula), #60 (proper archive UI with read-only mode, construction-site banner, and delete confirmation), and #63 (edit existing completions and log past completions from a split Complete button).

**Architecture:** Three independent feature areas sharing the same sprint. #64 is a one-liner in XPFormula. #60 adds a `deleteChore` store action and makes ChoreCard derive read-only state from `chore.active`. #63 adds two new store actions (`amendCompletion`, `recordRetroactiveCompletion`), a pure `eligiblePastWindows` utility, two new modals, and upgrades CompleteButton to a split button.

**Tech Stack:** React 19, TypeScript, Bun test runner (`bun test`), Zustand store, idb (IndexedDB), Tailwind CSS, shadcn/ui Dialog/DropdownMenu/Button components.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/components/chores/XPFormula.tsx` | Modify | Extract `formatStreakRange`, use percent format |
| `src/components/chores/XPFormula.test.ts` | Modify | Add test for `formatStreakRange` |
| `src/store/index.ts` | Modify | Alias db `deleteChore`; add 3 new store actions |
| `src/store/deleteChore.test.ts` | Create | Tests for `deleteChore` cascade |
| `src/store/amendCompletion.test.ts` | Create | Tests for `amendCompletion` XP recalc |
| `src/store/recordRetroactiveCompletion.test.ts` | Create | Tests for retroactive completion |
| `src/chores/eligiblePastWindows.ts` | Create | Pure function: eligible windows for retroactive logging |
| `src/chores/eligiblePastWindows.test.ts` | Create | Unit tests for eligibility logic |
| `src/components/dashboard/ChoreCard.tsx` | Modify | Read-only archived mode, delete dialog |
| `src/components/dashboard/Dashboard.tsx` | Modify | Archive banner, flat list in archive mode |
| `src/components/completion/AmendCompletionModal.tsx` | Create | Edit existing completion |
| `src/components/completion/LogPastCompletionModal.tsx` | Create | Log retroactive completion |
| `src/components/chores/ChorePage.tsx` | Modify | Edit button per history row |
| `src/components/chores/CompleteButton.tsx` | Modify | Split button with Log past option |

---

## Task 1: #64 — Streak range as percentage

**Files:**
- Modify: `src/components/chores/XPFormula.tsx`
- Modify: `src/components/chores/XPFormula.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/components/chores/XPFormula.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { showsRounding, formatStreakRange } from './XPFormula';

// ... existing tests ...

describe('formatStreakRange', () => {
  it('formats 1.0 as 100%–100%', () => {
    expect(formatStreakRange(1.0)).toBe('100%–100%');
  });

  it('formats 1.5 as 100%–150%', () => {
    expect(formatStreakRange(1.5)).toBe('100%–150%');
  });

  it('formats 2.5 as 100%–250%', () => {
    expect(formatStreakRange(2.5)).toBe('100%–250%');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /home/claude/projects/tasks-harmony && bun test src/components/chores/XPFormula.test.ts
```

Expected: `SyntaxError` or `formatStreakRange is not exported`.

- [ ] **Step 3: Export `formatStreakRange` and use it in XPFormula**

Replace the `streakRange` line in `src/components/chores/XPFormula.tsx`. The full relevant section changes from:

```ts
export function showsRounding(
  multiplier: MultiplierConfig | undefined,
  streakEnabled: boolean,
  decayEnabled: boolean,
): boolean {
  return !!multiplier || streakEnabled || decayEnabled;
}
```

to:

```ts
export function showsRounding(
  multiplier: MultiplierConfig | undefined,
  streakEnabled: boolean,
  decayEnabled: boolean,
): boolean {
  return !!multiplier || streakEnabled || decayEnabled;
}

export function formatStreakRange(maxStreakMultiplier: number): string {
  return `100%–${Math.round(maxStreakMultiplier * 100)}%`;
}
```

Then update the component body — change:

```ts
  const streakRange = `1–${settings.maxStreakMultiplier}`;
```

to:

```ts
  const streakRange = formatStreakRange(settings.maxStreakMultiplier);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/claude/projects/tasks-harmony && bun test src/components/chores/XPFormula.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/chores/XPFormula.tsx src/components/chores/XPFormula.test.ts
git commit -m "fix(xp-formula): show streak multiplier as percent range (#64)"
```

---

## Task 2: #60 — `deleteChore` store action

**Files:**
- Modify: `src/store/index.ts`
- Create: `src/store/deleteChore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/store/deleteChore.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, test } from 'bun:test';
import { useAppStore } from './index';
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';

describe('deleteChore', () => {
  let choreKey: string;
  let qId: string;

  beforeAll(async () => {
    await useAppStore.getState().init();

    choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'To Delete',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    qId = crypto.randomUUID();
    await useAppStore.getState().saveQuestions(choreKey, [{
      id: qId, choreKey, prompt: 'Notes?', type: 'TEXT',
      required: false, order: 0, _isNew: true,
    } as DraftQuestion]);

    await useAppStore.getState().recordCompletion(choreKey, [{ questionId: qId, value: 'hello' }]);
  });

  test('removes chore from state', async () => {
    await useAppStore.getState().deleteChore(choreKey);
    expect(useAppStore.getState().chores.find(c => c.key === choreKey)).toBeUndefined();
  });

  test('removes associated completions from state', () => {
    expect(useAppStore.getState().completions.filter(c => c.choreKey === choreKey)).toHaveLength(0);
  });

  test('removes associated questions from state', () => {
    expect(useAppStore.getState().questions.filter(q => q.choreKey === choreKey)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /home/claude/projects/tasks-harmony && bun test src/store/deleteChore.test.ts
```

Expected: error — `deleteChore is not a function`.

- [ ] **Step 3: Alias db import and add store action**

In `src/store/index.ts`, change the import on line 2 — replace `deleteChore` with `deleteChore as dbDeleteChore`:

```ts
import { openDB, getAllChores, getAllCompletions, getAllQuestions, getXPSettings, getProfile, getSyncState, getPacks, putChore, putCompletion, putProfile, putSyncState, putQuestion, deleteQuestion, deleteChore as dbDeleteChore, putPack, deleteCompletion, deletePack as dbDeletePack, getChoresByPack, getQuestions, getCompletionsByChore, getAllQuickAnswerSets, putQuickAnswerSet, deleteQuickAnswerSet as dbDeleteQuickAnswerSet } from '@/db';
```

Add `deleteChore` to the `AppState` interface (after `deactivateChore`):

```ts
  deleteChore: (key: string) => Promise<void>;
```

Add the implementation in the `create(...)` body (after `deactivateChore`):

```ts
  deleteChore: async (key) => {
    const { db, completions, questions, quickAnswerSets } = get();
    if (!db) throw new Error('DB not initialised');

    const choreCompletions = completions.filter((c) => c.choreKey === key);
    for (const c of choreCompletions) await deleteCompletion(db, c.id);

    const choreQuestions = questions.filter((q) => q.choreKey === key);
    for (const q of choreQuestions) await deleteQuestion(db, q.id);

    const choreSets = quickAnswerSets.filter((s) => s.choreKey === key);
    for (const s of choreSets) await dbDeleteQuickAnswerSet(db, s.id);

    await dbDeleteChore(db, key);

    set((state) => ({
      chores: state.chores.filter((c) => c.key !== key),
      completions: state.completions.filter((c) => c.choreKey !== key),
      questions: state.questions.filter((q) => q.choreKey !== key),
      quickAnswerSets: state.quickAnswerSets.filter((s) => s.choreKey !== key),
    }));
    markDirty();
  },
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/claude/projects/tasks-harmony && bun test src/store/deleteChore.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts src/store/deleteChore.test.ts
git commit -m "feat(store): add deleteChore action with cascade (#60)"
```

---

## Task 3: #60 — Read-only archived ChoreCard with delete dialog

**Files:**
- Modify: `src/components/dashboard/ChoreCard.tsx`

The card derives archived state from `chore.active`. When `!chore.active`:
- CompleteButton gets `disabled`
- Quick-answer buttons get `disabled`
- Dropdown shows only Delete (with confirmation dialog)

- [ ] **Step 1: Add `disabled` prop to CompleteButton**

In `src/components/chores/CompleteButton.tsx`, add `disabled?: boolean` to Props:

```ts
interface Props {
  choreKey: string;
  label?: string;
  disabled?: boolean;
}
```

And pass it to both the primary button and disable the click handler:

```ts
export default function CompleteButton({ choreKey, label = 'Complete', disabled: disabledProp }: Props) {
  // ... existing state ...

  async function handleClick() {
    if (processing || disabledProp) return;
    // ... existing logic ...
  }

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={processing || !!disabledProp}
        size="sm"
        className="bg-green-600 hover:bg-green-700 text-white disabled:bg-green-600 disabled:opacity-50"
      >
        {processing ? 'Saving…' : label}
      </Button>
      {showModal && (
        <CompletionModal choreKey={choreKey} questions={questions} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Add delete dialog state and handler in ChoreCard**

In `src/components/dashboard/ChoreCard.tsx`, add these imports at the top:

```ts
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
```

Add state inside the component (alongside existing `useState` calls):

```ts
  const deleteChore = useAppStore((s) => s.deleteChore);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
```

Add the handler:

```ts
  async function handleDelete() {
    setDeleting(true);
    try { await deleteChore(chore.key); } finally { setDeleting(false); setShowDeleteDialog(false); }
  }
```

- [ ] **Step 3: Update the JSX to reflect archived mode**

In ChoreCard's return, the `isArchived` flag drives the conditional rendering. Add `const isArchived = !chore.active;` near the top of the component body.

Change the CompleteButton renders to pass `disabled={isArchived}`:

```tsx
{(status === 'due' || status === 'overdue') && <CompleteButton choreKey={chore.key} disabled={isArchived} />}
{status === 'completed' && chore.repeatable && <CompleteButton choreKey={chore.key} label="Complete again" disabled={isArchived} />}
```

Change the quick-answer buttons to add `disabled={isArchived || !!quickCompleting}`:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => handleQuickComplete(set)}
  disabled={isArchived || !!quickCompleting}
  className="rounded-full border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-800/30"
>
```

Replace the dropdown content to conditionally show Edit/Duplicate vs Delete:

```tsx
<DropdownMenuContent align="end">
  {!isArchived && (
    <>
      <DropdownMenuItem onClick={() => setShowEditModal(true)}>Edit</DropdownMenuItem>
      <DropdownMenuItem onClick={() => setShowDuplicateDialog(true)}>Duplicate</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={handleDeactivate}>Archive</DropdownMenuItem>
    </>
  )}
  {isArchived && (
    <DropdownMenuItem variant="destructive" onClick={() => setShowDeleteDialog(true)}>Delete</DropdownMenuItem>
  )}
</DropdownMenuContent>
```

Add the delete confirmation dialog just before the closing `</>` of the component return:

```tsx
<Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Delete chore?</DialogTitle>
      <DialogDescription>
        All completion history for <strong>{chore.title}</strong> will be permanently deleted.
        Your total XP earned is preserved. This cannot be undone.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>
        Cancel
      </Button>
      <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
        {deleting ? 'Deleting…' : 'Delete'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 4: Run typecheck**

```bash
cd /home/claude/projects/tasks-harmony && bun run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/ChoreCard.tsx src/components/chores/CompleteButton.tsx
git commit -m "feat(archive): read-only ChoreCard with delete confirmation (#60)"
```

---

## Task 4: #60 — Archive banner and flat list in Dashboard

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx`

- [ ] **Step 1: Add archive banner and flat-list rendering**

In `src/components/dashboard/Dashboard.tsx`, add the archive banner immediately after the header `<div>` and before the empty-state check. Replace the section rendering block with a conditional that either shows the flat archive list or the normal sectioned list.

Full replacement of the return body:

```tsx
  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between pt-4">
        {!currentPackId && <h1 className="text-2xl font-bold">Dashboard</h1>}
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
      </div>

      {archiveMode && (
        <div
          className="flex items-center justify-center rounded-md py-2 text-sm font-semibold"
          style={{ background: 'repeating-linear-gradient(45deg, #f59e0b 0px, #f59e0b 20px, #000 20px, #000 40px)' }}
        >
          <span className="rounded bg-black/60 px-3 py-1 text-white">
            Archived — read-only
          </span>
        </div>
      )}

      {visibleChores.length === 0 && (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="text-muted-foreground">{archiveMode ? 'No archived chores.' : 'No chores yet.'}</p>
          {!archiveMode && <p className="mt-1 text-sm text-muted-foreground">Add your first chore to get started.</p>}
        </div>
      )}

      {archiveMode ? (
        <div data-compact-list={compact || undefined} className="space-y-3">
          {[...visibleChores].sort((a, b) => a.title.localeCompare(b.title)).map((chore) => (
            <ChoreCard
              key={chore.key}
              chore={chore}
              completions={completions.filter((c) => c.choreKey === chore.key)}
              xpSettings={xpSettings}
              profile={profile}
              packTitle={packs.find((p) => p.id === chore.packId)?.manifest.title}
              compact={compact}
            />
          ))}
        </div>
      ) : (
        <>
          {SECTION_ORDER.map((status) => {
            const sectionChores = grouped.get(status);
            if (!sectionChores || sectionChores.length === 0) return null;
            return (
              <section key={status}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {SECTION_LABELS[status]}
                </h2>
                <div data-compact-list={compact || undefined} className="space-y-3">
                  {sectionChores.map((chore) => (
                    <ChoreCard
                      key={chore.key}
                      chore={chore}
                      completions={completions.filter((c) => c.choreKey === chore.key)}
                      xpSettings={xpSettings}
                      profile={profile}
                      packTitle={packs.find((p) => p.id === chore.packId)?.manifest.title}
                      compact={compact}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}

      {showNewChoreModal && (
        <ChoreFormModal packId={currentPackId ?? 'personal'} onClose={() => setShowNewChoreModal(false)} />
      )}
    </div>
  );
```

- [ ] **Step 2: Run typecheck**

```bash
cd /home/claude/projects/tasks-harmony && bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/Dashboard.tsx
git commit -m "feat(archive): construction-site banner and flat archive list (#60)"
```

---

## Task 5: #63 — `eligiblePastWindows` utility

**Files:**
- Create: `src/chores/eligiblePastWindows.ts`
- Create: `src/chores/eligiblePastWindows.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/chores/eligiblePastWindows.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { eligiblePastWindows } from './eligiblePastWindows';
import type { Chore, Completion } from '@/types';

function makeChore(repeatable = false): Chore {
  return {
    key: 'personal/test', choreId: 'test', packId: 'personal',
    title: 'Test', xpSize: 'S',
    recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
    repeatable,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeCompletion(completedAt: string): Completion {
  return { id: crypto.randomUUID(), choreKey: 'personal/test', completedAt, xpEarned: 5, streak: 1, answers: [] };
}

describe('eligiblePastWindows', () => {
  it('returns empty when no past windows exist (started today)', () => {
    const now = new Date('2026-01-01T12:00:00');
    const result = eligiblePastWindows(makeChore(), [], now);
    expect(result).toHaveLength(0);
  });

  it('returns all closed windows when no completions exist', () => {
    const now = new Date('2026-01-04T12:00:00'); // day 4; windows 0,1,2 are closed
    const result = eligiblePastWindows(makeChore(), [], now);
    expect(result).toHaveLength(3);
    expect(result[0].index).toBe(0);
    expect(result[2].index).toBe(2);
  });

  it('returns only windows after the last completion window', () => {
    const now = new Date('2026-01-05T12:00:00'); // windows 0-3 closed
    const completions = [makeCompletion('2026-01-02T10:00:00')]; // in window index 1
    const result = eligiblePastWindows(makeChore(), completions, now);
    // eligible: indices 2, 3 only
    expect(result.map(w => w.index)).toEqual([2, 3]);
  });

  it('returns empty when last completion is in the window immediately before current', () => {
    const now = new Date('2026-01-03T12:00:00'); // current = window 2
    const completions = [makeCompletion('2026-01-02T10:00:00')]; // in window 1 (immediately before)
    const result = eligiblePastWindows(makeChore(), completions, now);
    expect(result).toHaveLength(0);
  });

  it('excludes already-completed windows for non-repeatable chores (safety guard)', () => {
    // This should not occur in practice (completions must be after lastIdx),
    // but verify the guard works.
    const chore = makeChore(false);
    const now = new Date('2026-01-05T12:00:00');
    // Completion in window 0, window 2 also has a completion (anomalous)
    const completions = [
      makeCompletion('2026-01-01T10:00:00'), // window 0
      makeCompletion('2026-01-03T10:00:00'), // window 2
    ];
    const result = eligiblePastWindows(chore, completions, now);
    // last completion is window 2; eligible = window 3 only
    expect(result.map(w => w.index)).toEqual([3]);
  });

  it('does not exclude completed windows for repeatable chores', () => {
    const chore = makeChore(true); // repeatable
    const now = new Date('2026-01-05T12:00:00');
    const completions = [makeCompletion('2026-01-01T10:00:00')]; // window 0
    const result = eligiblePastWindows(chore, completions, now);
    // all windows 1,2,3 eligible (no exclusion for repeatable)
    expect(result.map(w => w.index)).toEqual([1, 2, 3]);
  });

  it('window start and end are correct', () => {
    const now = new Date('2026-01-03T12:00:00');
    const result = eligiblePastWindows(makeChore(), [], now);
    // window 0: Jan 1 00:00 → Jan 2 00:00
    expect(result[0].start.toDateString()).toBe(new Date(2026, 0, 1).toDateString());
    expect(result[0].end.toDateString()).toBe(new Date(2026, 0, 2).toDateString());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /home/claude/projects/tasks-harmony && bun test src/chores/eligiblePastWindows.test.ts
```

Expected: module not found error.

- [ ] **Step 3: Create `eligiblePastWindows.ts`**

Create `src/chores/eligiblePastWindows.ts`:

```ts
import type { Chore, Completion } from '@/types';
import { getCurrentWindowIndex, getWindowStart, getWindowEnd } from './recurrence';

export interface EligibleWindow {
  index: number;
  start: Date;
  end: Date;
}

export function eligiblePastWindows(
  chore: Chore,
  completions: Completion[],
  now: Date,
): EligibleWindow[] {
  const currentIdx = getCurrentWindowIndex(chore.recurrence, now);
  if (currentIdx === null || currentIdx === 0) return [];

  let lastIdx = -1;
  for (const c of completions) {
    const idx = getCurrentWindowIndex(chore.recurrence, new Date(c.completedAt));
    if (idx !== null && idx > lastIdx) lastIdx = idx;
  }

  const results: EligibleWindow[] = [];
  for (let i = lastIdx + 1; i < currentIdx; i++) {
    if (!chore.repeatable) {
      const s = getWindowStart(chore.recurrence, i).getTime();
      const e = getWindowEnd(chore.recurrence, i).getTime();
      const hasCompletion = completions.some((c) => {
        const t = new Date(c.completedAt).getTime();
        return t >= s && t < e;
      });
      if (hasCompletion) continue;
    }
    results.push({
      index: i,
      start: getWindowStart(chore.recurrence, i),
      end: getWindowEnd(chore.recurrence, i),
    });
  }
  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/claude/projects/tasks-harmony && bun test src/chores/eligiblePastWindows.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/chores/eligiblePastWindows.ts src/chores/eligiblePastWindows.test.ts
git commit -m "feat(chores): add eligiblePastWindows utility (#63)"
```

---

## Task 6: #63 — `amendCompletion` store action

**Files:**
- Modify: `src/store/index.ts`
- Create: `src/store/amendCompletion.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/store/amendCompletion.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, test } from 'bun:test';
import { useAppStore } from './index';
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';

describe('amendCompletion', () => {
  let choreKey: string;
  let completionId: string;
  let multiplierQId: string;

  beforeAll(async () => {
    await useAppStore.getState().init();

    choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Amendable Chore',
      xpSize: 'S', // base XP = 5
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    multiplierQId = crypto.randomUUID();
    await useAppStore.getState().saveQuestions(choreKey, [{
      id: multiplierQId, choreKey, prompt: 'Reps?', type: 'MULTIPLIER',
      required: true, order: 0, xpPerUnit: 2, multiplierAnswerType: 'integer', _isNew: true,
    } as DraftQuestion]);

    await useAppStore.getState().recordCompletion(choreKey, [{ questionId: multiplierQId, value: 3 }]);
    completionId = useAppStore.getState().completions.find(c => c.choreKey === choreKey)!.id;
  });

  test('updates answers on the completion', async () => {
    const newAnswers = [{ questionId: multiplierQId, value: 5 }];
    await useAppStore.getState().amendCompletion(completionId, {
      completedAt: '2026-01-01T10:00:00.000Z',
      answers: newAnswers,
    });
    const c = useAppStore.getState().completions.find(c => c.id === completionId)!;
    expect(c.answers).toEqual(newAnswers);
  });

  test('recalculates xpEarned after answer change', () => {
    // answer=5, xpPerUnit=2, base=5, streak=1 → round(5 × 2 × 5) = 50
    const c = useAppStore.getState().completions.find(c => c.id === completionId)!;
    expect(c.xpEarned).toBe(50);
  });

  test('updates completedAt', async () => {
    await useAppStore.getState().amendCompletion(completionId, {
      completedAt: '2026-01-01T18:00:00.000Z',
      answers: [{ questionId: multiplierQId, value: 5 }],
    });
    const c = useAppStore.getState().completions.find(c => c.id === completionId)!;
    expect(c.completedAt).toBe('2026-01-01T18:00:00.000Z');
  });

  test('preserves streak value (not recalculated)', () => {
    const c = useAppStore.getState().completions.find(c => c.id === completionId)!;
    expect(c.streak).toBeGreaterThan(0); // same as originally recorded
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /home/claude/projects/tasks-harmony && bun test src/store/amendCompletion.test.ts
```

Expected: `amendCompletion is not a function`.

- [ ] **Step 3: Add `amendCompletion` to store**

Add to the `AppState` interface in `src/store/index.ts` (after `recordCompletion`):

```ts
  amendCompletion: (id: string, patch: { completedAt: string; answers: Answer[] }) => Promise<void>;
```

Add the implementation (after `recordCompletion`):

```ts
  amendCompletion: async (id, { completedAt, answers }) => {
    const { db, completions, chores, xpSettings, profile, questions } = get();
    if (!db) throw new Error('DB not initialised');

    const completion = completions.find((c) => c.id === id);
    if (!completion) throw new Error(`Completion not found: ${id}`);

    const chore = chores.find((c) => c.key === completion.choreKey);
    if (!chore) throw new Error(`Chore not found: ${completion.choreKey}`);

    const chorePack = get().packs.find((p) => p.id === chore.packId);
    const packDecay = chorePack?.manifest.decay ?? true;

    const activeSettings = xpSettings.find((s) => s.id === profile?.activeXPSettingsId) ?? xpSettings[0];
    if (!activeSettings) throw new Error('No XP settings found');

    const otherCompletions = completions.filter((c) => c.choreKey === completion.choreKey && c.id !== id);
    const effectiveTotalCompletions = packDecay ? otherCompletions.length : 0;

    let xpEarned = calculateXP(chore.xpSize, completion.streak, effectiveTotalCompletions, activeSettings);
    const multiplierQ = questions.find(
      (q): q is MultiplierQuestion => q.choreKey === completion.choreKey && q.type === 'MULTIPLIER',
    );
    if (multiplierQ) {
      const mulAnswer = answers.find((a) => a.questionId === multiplierQ.id);
      if (mulAnswer && typeof mulAnswer.value === 'number' && mulAnswer.value > 0) {
        xpEarned = Math.round(xpEarned * multiplierQ.xpPerUnit * mulAnswer.value);
      }
    }

    const updated = { ...completion, completedAt, answers, xpEarned };
    await putCompletion(db, updated);
    set((state) => ({
      completions: state.completions.map((c) => (c.id === id ? updated : c)),
    }));
    markDirty();
  },
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/claude/projects/tasks-harmony && bun test src/store/amendCompletion.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts src/store/amendCompletion.test.ts
git commit -m "feat(store): add amendCompletion action (#63)"
```

---

## Task 7: #63 — `recordRetroactiveCompletion` store action

**Files:**
- Modify: `src/store/index.ts`
- Create: `src/store/recordRetroactiveCompletion.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/store/recordRetroactiveCompletion.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, test } from 'bun:test';
import { useAppStore } from './index';

describe('recordRetroactiveCompletion', () => {
  let choreKey: string;

  beforeAll(async () => {
    await useAppStore.getState().init();

    choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Retroactive Chore',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });
  });

  test('creates a completion with the supplied timestamp', async () => {
    await useAppStore.getState().recordRetroactiveCompletion(choreKey, {
      completedAt: '2026-01-02T10:00:00.000Z',
      answers: [],
    });

    const completions = useAppStore.getState().completions.filter(c => c.choreKey === choreKey);
    expect(completions).toHaveLength(1);
    expect(completions[0].completedAt).toBe('2026-01-02T10:00:00.000Z');
  });

  test('computes streak based on the retroactive timestamp', () => {
    // window index 1 (Jan 2). No prior completion → streak should be 1
    const c = useAppStore.getState().completions.filter(c => c.choreKey === choreKey)[0];
    expect(c.streak).toBeGreaterThanOrEqual(1);
  });

  test('earns XP > 0', () => {
    const c = useAppStore.getState().completions.filter(c => c.choreKey === choreKey)[0];
    expect(c.xpEarned).toBeGreaterThan(0);
  });

  test('totalCompletions for XP uses existing count at save time', async () => {
    // After first retroactive completion, totalCompletions for the next = 1
    const choreKey2 = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Retro Chore 2',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: true,
      active: true,
    });

    await useAppStore.getState().recordRetroactiveCompletion(choreKey2, {
      completedAt: '2026-01-01T10:00:00.000Z',
      answers: [],
    });
    const xp1 = useAppStore.getState().completions.filter(c => c.choreKey === choreKey2)[0].xpEarned;

    await useAppStore.getState().recordRetroactiveCompletion(choreKey2, {
      completedAt: '2026-01-02T10:00:00.000Z',
      answers: [],
    });
    const xp2 = useAppStore.getState().completions.filter(c => c.choreKey === choreKey2)[1].xpEarned;

    // With decay enabled, second completion earns less XP (higher totalCompletions)
    expect(xp2).toBeLessThanOrEqual(xp1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /home/claude/projects/tasks-harmony && bun test src/store/recordRetroactiveCompletion.test.ts
```

Expected: `recordRetroactiveCompletion is not a function`.

- [ ] **Step 3: Add `recordRetroactiveCompletion` to store**

Add to the `AppState` interface (after `amendCompletion`):

```ts
  recordRetroactiveCompletion: (choreKey: string, data: { completedAt: string; answers: Answer[] }) => Promise<void>;
```

Add the implementation (after `amendCompletion`):

```ts
  recordRetroactiveCompletion: async (choreKey, { completedAt, answers }) => {
    const { db, chores, completions, xpSettings, profile, questions } = get();
    if (!db) throw new Error('DB not initialised');

    const chore = chores.find((c) => c.key === choreKey);
    if (!chore) throw new Error(`Chore not found: ${choreKey}`);

    const chorePack = get().packs.find((p) => p.id === chore.packId);
    const packStreak = chorePack?.manifest.streak ?? true;
    const packDecay = chorePack?.manifest.decay ?? true;

    const now = new Date(completedAt);
    const activeSettings = xpSettings.find((s) => s.id === profile?.activeXPSettingsId) ?? xpSettings[0];
    if (!activeSettings) throw new Error('No XP settings found');

    const choreCompletions = completions.filter((c) => c.choreKey === choreKey);
    const streak = packStreak ? computeNewStreak(chore, choreCompletions, now) : 0;
    const totalCompletions = choreCompletions.length;
    const effectiveTotalCompletions = packDecay ? totalCompletions : 0;

    let xpEarned = calculateXP(chore.xpSize, streak, effectiveTotalCompletions, activeSettings);
    const multiplierQ = questions.find(
      (q): q is MultiplierQuestion => q.choreKey === choreKey && q.type === 'MULTIPLIER',
    );
    if (multiplierQ) {
      const mulAnswer = answers.find((a) => a.questionId === multiplierQ.id);
      if (mulAnswer && typeof mulAnswer.value === 'number' && mulAnswer.value > 0) {
        xpEarned = Math.round(xpEarned * multiplierQ.xpPerUnit * mulAnswer.value);
      }
    }

    const newCompletion: Completion = {
      id: crypto.randomUUID(),
      choreKey,
      completedAt,
      xpEarned,
      streak,
      answers,
    };

    await putCompletion(db, newCompletion);
    set((state) => ({ completions: [...state.completions, newCompletion] }));
    markDirty();
  },
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/claude/projects/tasks-harmony && bun test src/store/recordRetroactiveCompletion.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run all store tests**

```bash
cd /home/claude/projects/tasks-harmony && bun test src/store/
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/store/index.ts src/store/recordRetroactiveCompletion.test.ts
git commit -m "feat(store): add recordRetroactiveCompletion action (#63)"
```

---

## Task 8: #63 — `AmendCompletionModal` and ChorePage edit button

**Files:**
- Create: `src/components/completion/AmendCompletionModal.tsx`
- Modify: `src/components/chores/ChorePage.tsx`

- [ ] **Step 1: Create `AmendCompletionModal`**

Create `src/components/completion/AmendCompletionModal.tsx`:

```tsx
import { useState } from 'react';
import type { Chore, Completion, Question, Answer } from '@/types';
import { useAppStore } from '@/store';
import { validateAnswer } from '@/questions/validation';
import { getCurrentWindowIndex, getWindowStart, getWindowEnd } from '@/chores/recurrence';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import AnswerField from './AnswerField';

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface Props {
  completion: Completion;
  chore: Chore;
  choreCompletions: Completion[];
  questions: Question[];
  onClose: () => void;
}

export default function AmendCompletionModal({ completion, chore, choreCompletions, questions, onClose }: Props) {
  const amendCompletion = useAppStore((s) => s.amendCompletion);
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

  const completedAtDate = new Date(completion.completedAt);
  const windowIdx = getCurrentWindowIndex(chore.recurrence, completedAtDate) ?? 0;
  const windowStart = getWindowStart(chore.recurrence, windowIdx);
  const windowEnd = getWindowEnd(chore.recurrence, windowIdx);

  const sortedSiblings = choreCompletions
    .filter((c) => c.id !== completion.id)
    .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
  const prev = sortedSiblings.filter((c) => new Date(c.completedAt) < completedAtDate).at(-1);
  const next = sortedSiblings.find((c) => new Date(c.completedAt) > completedAtDate);

  const minDate = prev
    ? new Date(Math.max(windowStart.getTime(), new Date(prev.completedAt).getTime() + 1000))
    : windowStart;
  const maxDate = next
    ? new Date(Math.min(windowEnd.getTime() - 1000, new Date(next.completedAt).getTime() - 1000))
    : new Date(windowEnd.getTime() - 1000);

  const [completedAt, setCompletedAt] = useState(toDatetimeLocal(completedAtDate));
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>(
    () => Object.fromEntries(sortedQuestions.map((q) => {
      const existing = completion.answers.find((a) => a.questionId === q.id);
      return [q.id, existing?.value ?? null];
    })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function handleChange(questionId: string, value: string | number | boolean | null) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (errors[questionId]) setErrors((prev) => { const next = { ...prev }; delete next[questionId]; return next; });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    for (const question of sortedQuestions) {
      const answer: Answer = { questionId: question.id, value: answers[question.id] ?? null };
      const error = validateAnswer(answer, question);
      if (error) newErrors[question.id] = error;
    }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setSubmitting(true);
    try {
      const answerList: Answer[] = sortedQuestions.map((q) => ({ questionId: q.id, value: answers[q.id] ?? null }));
      await amendCompletion(completion.id, {
        completedAt: new Date(completedAt).toISOString(),
        answers: answerList,
      });
      onClose();
    } finally { setSubmitting(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Completion</DialogTitle>
        </DialogHeader>
        <form id="amend-form" onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1">
            <Label>Completed at</Label>
            <input
              type="datetime-local"
              value={completedAt}
              min={toDatetimeLocal(minDate)}
              max={toDatetimeLocal(maxDate)}
              onChange={(e) => setCompletedAt(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          {sortedQuestions.map((question) => (
            <AnswerField
              key={question.id}
              question={question}
              value={answers[question.id] ?? null}
              error={errors[question.id]}
              onChange={(value) => handleChange(question.id, value)}
            />
          ))}
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="amend-form" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add edit button to ChorePage**

Replace the content of `src/components/chores/ChorePage.tsx` with:

```tsx
import { useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import { getAnswerDisplay } from '@/questions/display';
import { Button } from '@/components/ui/button';
import { MarkdownDisplay } from '@/components/ui/MarkdownDisplay';
import AmendCompletionModal from '@/components/completion/AmendCompletionModal';
import type { Completion } from '@/types';

export default function ChorePage() {
  const { encodedChoreKey } = useParams<{ encodedChoreKey: string }>();
  const navigate = useNavigate();
  const [editingCompletion, setEditingCompletion] = useState<Completion | null>(null);

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
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="py-4">
      <Button variant="link" onClick={() => navigate(-1)} className="mb-4 px-0">← Back</Button>

      <h1 className="mb-2 text-2xl font-bold text-foreground">{chore.title}</h1>

      {chore.description && (
        <MarkdownDisplay key={chore.description} content={chore.description} className="mb-4 text-sm text-muted-foreground" />
      )}

      <h2 className="mb-3 text-lg font-semibold text-foreground">Completion History</h2>

      {completions.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No completions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 font-medium text-foreground whitespace-nowrap">Completed at</th>
                {choreQuestions.map((q) => (
                  <th key={q.id} className="py-2 pr-4 font-medium text-foreground">{q.prompt}</th>
                ))}
                <th className="py-2 font-medium text-foreground text-right">XP earned</th>
                <th className="py-2 pl-4 font-medium text-foreground text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {completions.map((c) => (
                <tr key={c.id} className="border-b border-border hover:bg-muted">
                  <th scope="row" className="py-2 pr-4 text-muted-foreground whitespace-nowrap font-normal">{formatDate(c.completedAt)}</th>
                  {choreQuestions.map((q) => (
                    <td key={q.id} className="py-2 pr-4 text-muted-foreground">
                      {getAnswerDisplay(c.answers, q)}
                    </td>
                  ))}
                  <td className="py-2 text-foreground font-medium text-right">{c.xpEarned}</td>
                  <td className="py-2 pl-4 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditingCompletion(c)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingCompletion && (
        <AmendCompletionModal
          completion={editingCompletion}
          chore={chore}
          choreCompletions={completions}
          questions={choreQuestions}
          onClose={() => setEditingCompletion(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd /home/claude/projects/tasks-harmony && bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/completion/AmendCompletionModal.tsx src/components/chores/ChorePage.tsx
git commit -m "feat(completions): edit existing completion from history table (#63)"
```

---

## Task 9: #63 — `LogPastCompletionModal` and split `CompleteButton`

**Files:**
- Create: `src/components/completion/LogPastCompletionModal.tsx`
- Modify: `src/components/chores/CompleteButton.tsx`

- [ ] **Step 1: Create `LogPastCompletionModal`**

Create `src/components/completion/LogPastCompletionModal.tsx`:

```tsx
import { useState } from 'react';
import type { Chore, Completion, Question, Answer } from '@/types';
import type { EligibleWindow } from '@/chores/eligiblePastWindows';
import { useAppStore } from '@/store';
import { validateAnswer } from '@/questions/validation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AnswerField from './AnswerField';

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatWindowLabel(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

interface Props {
  chore: Chore;
  eligibleWindows: EligibleWindow[];
  questions: Question[];
  onClose: () => void;
}

export default function LogPastCompletionModal({ chore, eligibleWindows, questions, onClose }: Props) {
  const recordRetroactiveCompletion = useAppStore((s) => s.recordRetroactiveCompletion);
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedWindow = eligibleWindows[selectedIndex];

  const defaultCompletedAt = toDatetimeLocal(new Date(selectedWindow.end.getTime() - 1000));
  const [completedAt, setCompletedAt] = useState(defaultCompletedAt);

  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>(
    () => Object.fromEntries(sortedQuestions.map((q) => [q.id, null])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function handleWindowChange(idx: number) {
    setSelectedIndex(idx);
    const w = eligibleWindows[idx];
    setCompletedAt(toDatetimeLocal(new Date(w.end.getTime() - 1000)));
  }

  function handleAnswerChange(questionId: string, value: string | number | boolean | null) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (errors[questionId]) setErrors((prev) => { const next = { ...prev }; delete next[questionId]; return next; });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    for (const question of sortedQuestions) {
      const answer: Answer = { questionId: question.id, value: answers[question.id] ?? null };
      const error = validateAnswer(answer, question);
      if (error) newErrors[question.id] = error;
    }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setSubmitting(true);
    try {
      const answerList: Answer[] = sortedQuestions.map((q) => ({ questionId: q.id, value: answers[q.id] ?? null }));
      await recordRetroactiveCompletion(chore.key, {
        completedAt: new Date(completedAt).toISOString(),
        answers: answerList,
      });
      onClose();
    } finally { setSubmitting(false); }
  }

  const windowMin = toDatetimeLocal(selectedWindow.start);
  const windowMax = toDatetimeLocal(new Date(selectedWindow.end.getTime() - 1000));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log past completion</DialogTitle>
        </DialogHeader>
        <form id="log-past-form" onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1">
            <Label>Window</Label>
            <Select
              value={String(selectedIndex)}
              onValueChange={(v) => handleWindowChange(Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {eligibleWindows.map((w, i) => (
                  <SelectItem key={w.index} value={String(i)}>
                    {formatWindowLabel(w.start, w.end)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Completed at</Label>
            <input
              type="datetime-local"
              value={completedAt}
              min={windowMin}
              max={windowMax}
              onChange={(e) => setCompletedAt(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          {sortedQuestions.map((question) => (
            <AnswerField
              key={question.id}
              question={question}
              value={answers[question.id] ?? null}
              error={errors[question.id]}
              onChange={(value) => handleAnswerChange(question.id, value)}
            />
          ))}
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="log-past-form" disabled={submitting} className="bg-green-600 hover:bg-green-700 text-white disabled:bg-green-600 disabled:opacity-50">
            {submitting ? 'Saving…' : 'Log completion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Upgrade CompleteButton to split button**

Replace the full contents of `src/components/chores/CompleteButton.tsx`:

```tsx
import { useState } from 'react';
import { useAppStore } from '@/store';
import { useShallow } from 'zustand/shallow';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { eligiblePastWindows } from '@/chores/eligiblePastWindows';
import CompletionModal from '@/components/completion/CompletionModal';
import LogPastCompletionModal from '@/components/completion/LogPastCompletionModal';

interface Props {
  choreKey: string;
  label?: string;
  disabled?: boolean;
}

export default function CompleteButton({ choreKey, label = 'Complete', disabled: disabledProp }: Props) {
  const recordCompletion = useAppStore((s) => s.recordCompletion);
  const chore = useAppStore((s) => s.chores.find((c) => c.key === choreKey));
  const choreCompletions = useAppStore(useShallow((s) => s.completions.filter((c) => c.choreKey === choreKey)));
  const questions = useAppStore(useShallow((s) => s.questions.filter((q) => q.choreKey === choreKey)));
  const [processing, setProcessing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showLogPastModal, setShowLogPastModal] = useState(false);

  const eligibleWindows = chore ? eligiblePastWindows(chore, choreCompletions, new Date()) : [];
  const canLogPast = eligibleWindows.length > 0;

  async function handleClick() {
    if (processing || disabledProp) return;
    if (questions.length > 0) { setShowModal(true); return; }
    setProcessing(true);
    try { await recordCompletion(choreKey); } finally { setProcessing(false); }
  }

  const btnClass = 'bg-green-600 hover:bg-green-700 text-white disabled:bg-green-600 disabled:opacity-50';

  return (
    <>
      <div className="flex">
        <Button
          onClick={handleClick}
          disabled={processing || !!disabledProp}
          size="sm"
          className={`${btnClass} rounded-r-none`}
        >
          {processing ? 'Saving…' : label}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              disabled={!!disabledProp}
              className={`${btnClass} rounded-l-none border-l border-green-500/40 px-1.5`}
              aria-label="More completion options"
            >
              ▾
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!canLogPast}
              onClick={() => { if (canLogPast) setShowLogPastModal(true); }}
            >
              Log past completion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {showModal && (
        <CompletionModal choreKey={choreKey} questions={questions} onClose={() => setShowModal(false)} />
      )}
      {showLogPastModal && chore && (
        <LogPastCompletionModal
          chore={chore}
          eligibleWindows={eligibleWindows}
          questions={questions}
          onClose={() => setShowLogPastModal(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd /home/claude/projects/tasks-harmony && bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
cd /home/claude/projects/tasks-harmony && bun test src/
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/completion/LogPastCompletionModal.tsx src/components/chores/CompleteButton.tsx
git commit -m "feat(completions): split CompleteButton with Log past completion (#63)"
```
