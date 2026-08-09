# Targets Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 bugs in the target management UI: remove stale ordering controls, prevent duplicate pre-fills, add a shared progress-bar component with the correct color, and restore grouping/progress/totals support on the chore details page.

**Architecture:** Four existing files are modified (TargetBuilder.tsx, completionsTable.ts, ChorePage.tsx, ChoreCard.tsx) and one new component is created (TargetProgressBar.tsx). Pure logic changes get unit tests first (TDD). The component extraction is verified with a component test.

**Tech Stack:** React 18, TypeScript, Vitest, @testing-library/react, Tailwind CSS, Zustand.

---

## File Map

| File | Action |
|---|---|
| `src/components/chores/TargetBuilder.tsx` | Modify – sort questions, remove order UI, filter duplicate completions |
| `src/components/chores/TargetBuilder.test.ts` | Create – unit tests for `isDuplicateOfAnyDraft` |
| `src/components/chores/TargetProgressBar.tsx` | Create – shared progress bar component |
| `src/components/chores/TargetProgressBar.test.tsx` | Create – component tests |
| `src/components/dashboard/ChoreCard.tsx` | Modify – replace inline progress bar with TargetProgressBar |
| `src/components/chores/completionsTable.ts` | Modify – add `groupTargets` export |
| `src/components/chores/completionsTable.test.ts` | Modify – add `groupTargets` tests |
| `src/components/chores/ChorePage.tsx` | Modify – add progress bar, totals tfoot, grouped targets |

---

### Task 1: TargetBuilder – sort questions, remove ordering UI, filter duplicates (Bugs 1, 2, 7)

**Files:**
- Modify: `src/components/chores/TargetBuilder.tsx`
- Create: `src/components/chores/TargetBuilder.test.ts`

Three interrelated fixes to one file:
- **Bug 7:** `summarise()` iterates `questions` to build the label string. Sort questions by `q.order` first.
- **Bug 1:** The `↑/↓` buttons call `moveUp`/`moveDown` which set `draft.order`. Remove those functions and the buttons. Replace with deterministic sort of the visible draft list by question answer values (first question = primary sort key, etc.).
- **Bug 2:** `unlinkedCompletions` must also exclude completions whose answers exactly match any active draft for every chore question (null == null counts as equal).

The duplicate check logic is extracted as an exported pure function `isDuplicateOfAnyDraft` so it can be unit tested.

`DraftTarget` shape (from `src/store/index.ts`):
```typescript
interface DraftTarget {
  id: string;
  order: number;
  answers: Answer[];        // Answer = { questionId: string; value: string | number | boolean | null }
  linkedCompletionId?: string;
  _deleted?: boolean;
}
```

- [ ] **Step 1: Write the failing test**

Create `src/components/chores/TargetBuilder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isDuplicateOfAnyDraft } from './TargetBuilder';
import type { Question, Answer } from '@/types';
import type { DraftTarget } from '@/store';

const q1: Question = { id: 'q1', choreKey: 'p/c', prompt: 'Q1', required: false, order: 1, type: 'TEXT' };
const q2: Question = { id: 'q2', choreKey: 'p/c', prompt: 'Q2', required: false, order: 2, type: 'INTEGER' };

function makeDraft(q1Val: string | null, q2Val: number | null): DraftTarget {
  const answers: Answer[] = [];
  if (q1Val !== null) answers.push({ questionId: 'q1', value: q1Val });
  if (q2Val !== null) answers.push({ questionId: 'q2', value: q2Val });
  return { id: 'draft-1', order: 0, answers };
}

describe('isDuplicateOfAnyDraft', () => {
  it('returns true when completion answers exactly match a draft', () => {
    const drafts = [makeDraft('hello', 5)];
    const answers: Answer[] = [
      { questionId: 'q1', value: 'hello' },
      { questionId: 'q2', value: 5 },
    ];
    expect(isDuplicateOfAnyDraft(answers, drafts, [q1, q2])).toBe(true);
  });

  it('returns false when one answer value differs', () => {
    const drafts = [makeDraft('hello', 5)];
    const answers: Answer[] = [
      { questionId: 'q1', value: 'hello' },
      { questionId: 'q2', value: 6 },
    ];
    expect(isDuplicateOfAnyDraft(answers, drafts, [q1, q2])).toBe(false);
  });

  it('returns false when draft has null for a question but completion has a value', () => {
    // draft has no q1 answer → null; completion has q1 = 'hello' → not equal
    const drafts = [makeDraft(null, 5)];
    const answers: Answer[] = [
      { questionId: 'q1', value: 'hello' },
      { questionId: 'q2', value: 5 },
    ];
    expect(isDuplicateOfAnyDraft(answers, drafts, [q1, q2])).toBe(false);
  });

  it('returns true when both have null for a question', () => {
    // draft has no q1 → null; completion has no q1 → null; both null for q1
    const drafts = [makeDraft(null, 5)];
    const answers: Answer[] = [{ questionId: 'q2', value: 5 }]; // q1 absent → null
    expect(isDuplicateOfAnyDraft(answers, drafts, [q1, q2])).toBe(true);
  });

  it('returns false when there are no drafts', () => {
    const answers: Answer[] = [{ questionId: 'q1', value: 'hello' }];
    expect(isDuplicateOfAnyDraft(answers, [], [q1])).toBe(false);
  });

  it('returns true if any one draft matches', () => {
    const drafts = [makeDraft('other', 1), makeDraft('hello', 5)];
    const answers: Answer[] = [
      { questionId: 'q1', value: 'hello' },
      { questionId: 'q2', value: 5 },
    ];
    expect(isDuplicateOfAnyDraft(answers, drafts, [q1, q2])).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
bunx vitest run src/components/chores/TargetBuilder.test.ts
```
Expected: FAIL — `isDuplicateOfAnyDraft is not a function` or module export missing.

- [ ] **Step 3: Replace the entire content of `src/components/chores/TargetBuilder.tsx`**

```tsx
import { useState } from 'react';
import type { Question, Completion, XPSize, Answer } from '@/types';
import type { DraftTarget } from '@/store';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TargetFormModal from './TargetFormModal';
import { getAnswerDisplay } from '@/questions/display';

const XP_SIZES: XPSize[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

interface Props {
  questions: Question[];
  existingCompletions: Completion[];
  drafts: DraftTarget[];
  bonusEnabled: boolean;
  bonusXPSize: XPSize;
  choreXPSize: XPSize | number;
  onChange: (drafts: DraftTarget[]) => void;
  onBonusEnabledChange: (enabled: boolean) => void;
  onBonusXPSizeChange: (size: XPSize) => void;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  return String(a).localeCompare(String(b));
}

export function isDuplicateOfAnyDraft(
  completionAnswers: Answer[],
  drafts: DraftTarget[],
  questions: Question[],
): boolean {
  return drafts.some((draft) =>
    questions.every((q) => {
      const completionVal = completionAnswers.find((a) => a.questionId === q.id)?.value ?? null;
      const draftVal = draft.answers.find((a) => a.questionId === q.id)?.value ?? null;
      return completionVal === draftVal;
    }),
  );
}

export default function TargetBuilder({
  questions, existingCompletions, drafts, bonusEnabled, bonusXPSize, choreXPSize,
  onChange, onBonusEnabledChange, onBonusXPSizeChange,
}: Props) {
  const [editingDraft, setEditingDraft] = useState<DraftTarget | 'new' | null>(null);

  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);
  const activeDrafts = drafts.filter((d) => !d._deleted);
  const deletedDrafts = drafts.filter((d) => d._deleted);

  const linkedCompletionIds = new Set(activeDrafts.map((d) => d.linkedCompletionId).filter(Boolean));
  const unlinkedCompletions = existingCompletions.filter((c) => {
    if (c.targetId) return false;
    if (linkedCompletionIds.has(c.id)) return false;
    return !isDuplicateOfAnyDraft(c.answers, activeDrafts, sortedQuestions);
  });

  const sortedDrafts = [...activeDrafts].sort((a, b) => {
    for (const q of sortedQuestions) {
      const av = a.answers.find((ans) => ans.questionId === q.id)?.value ?? null;
      const bv = b.answers.find((ans) => ans.questionId === q.id)?.value ?? null;
      const r = compareValues(av, bv);
      if (r !== 0) return r;
    }
    return 0;
  });

  function handleSave(saved: DraftTarget) {
    if (editingDraft === 'new') {
      onChange([...drafts, { ...saved, order: activeDrafts.length }]);
    } else {
      onChange(drafts.map((d) => d.id === saved.id ? { ...d, ...saved } : d));
    }
    setEditingDraft(null);
  }

  function handleDelete(id: string) {
    onChange(drafts.map((d) => d.id === id ? { ...d, _deleted: true } : d));
  }

  function handleRestore(id: string) {
    onChange(drafts.map((d) => d.id === id ? { ...d, _deleted: false } : d));
  }

  function summarise(draft: DraftTarget): string {
    return sortedQuestions
      .map((q) => {
        const ans = draft.answers.find((a) => a.questionId === q.id);
        if (!ans) return null;
        return getAnswerDisplay([ans], q);
      })
      .filter(Boolean)
      .join(', ') || '(empty)';
  }

  const defaultBonusSize: XPSize = typeof choreXPSize === 'string' ? choreXPSize as XPSize : 'M';

  return (
    <div className="space-y-3">
      {/* Set completion bonus */}
      <div className="flex items-center gap-3">
        <input
          id="bonus-enabled"
          type="checkbox"
          checked={bonusEnabled}
          onChange={(e) => {
            onBonusEnabledChange(e.target.checked);
            if (e.target.checked) onBonusXPSizeChange(defaultBonusSize);
          }}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        <Label htmlFor="bonus-enabled" className="font-normal">Set completion bonus</Label>
      </div>
      {bonusEnabled && (
        <div className="ml-7">
          <Select value={bonusXPSize} onValueChange={(v) => onBonusXPSizeChange(v as XPSize)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {XP_SIZES.map((size) => (
                <SelectItem key={size} value={size}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Target list */}
      <Button type="button" variant="outline" size="sm" onClick={() => setEditingDraft('new')}>
        + Add target
      </Button>

      <div className="space-y-1">
        {sortedDrafts.map((draft) => (
          <div key={draft.id} className="flex items-center gap-2 rounded border border-border px-2 py-1 text-sm">
            <span className="flex-1 text-foreground truncate">{summarise(draft)}</span>
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline" onClick={() => setEditingDraft(draft)}>Edit</button>
            <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => handleDelete(draft.id)} aria-label="Remove target">×</button>
          </div>
        ))}
        {deletedDrafts.map((draft) => (
          <div key={draft.id} className="flex items-center gap-2 rounded border border-border px-2 py-1 text-sm opacity-40">
            <span className="flex-1 truncate line-through">{summarise(draft)}</span>
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline" onClick={() => handleRestore(draft.id)}>Restore</button>
          </div>
        ))}
      </div>

      {editingDraft !== null && (
        <TargetFormModal
          questions={sortedQuestions}
          unlinkedCompletions={editingDraft === 'new' ? unlinkedCompletions : []}
          initialDraft={editingDraft === 'new' ? undefined : editingDraft}
          onSave={handleSave}
          onClose={() => setEditingDraft(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
bunx vitest run src/components/chores/TargetBuilder.test.ts
```
Expected: all 6 tests pass.

- [ ] **Step 5: Run typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/chores/TargetBuilder.tsx src/components/chores/TargetBuilder.test.ts
git commit -m "fix(targets): sort questions/drafts by order; remove ordering UI; exclude duplicate completions"
```

---

### Task 2: Extract shared TargetProgressBar component (Bug 6)

**Files:**
- Create: `src/components/chores/TargetProgressBar.tsx`
- Create: `src/components/chores/TargetProgressBar.test.tsx`
- Modify: `src/components/dashboard/ChoreCard.tsx`

The progress bar currently lives inline in `ChoreCard.tsx` (lines 97–118) using `bg-green-500`. Extract it into a shared component and change the fill color to `bg-indigo-400`. `ChoreCard` then uses the shared component.

- [ ] **Step 1: Write the failing test**

Create `src/components/chores/TargetProgressBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TargetProgressBar from './TargetProgressBar';

describe('TargetProgressBar', () => {
  it('shows label and count when not all done', () => {
    render(<TargetProgressBar done={2} total={5} />);
    expect(screen.getByText('Target progress')).toBeInTheDocument();
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
  });

  it('shows Completed badge when done equals total', () => {
    render(<TargetProgressBar done={3} total={3} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText('3 / 3')).not.toBeInTheDocument();
  });

  it('fills bar to correct percentage', () => {
    const { container } = render(<TargetProgressBar done={1} total={4} />);
    const fill = container.querySelector('.bg-indigo-400') as HTMLElement;
    expect(fill).toBeTruthy();
    expect(fill.style.width).toBe('25%');
  });

  it('compact: omits label row and shows title attribute on bar', () => {
    const { container } = render(<TargetProgressBar done={2} total={5} compact />);
    expect(screen.queryByText('Target progress')).not.toBeInTheDocument();
    expect(container.querySelector('[title="2 / 5 targets"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
bunx vitest run src/components/chores/TargetProgressBar.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/chores/TargetProgressBar.tsx`**

```tsx
interface Props {
  done: number;
  total: number;
  compact?: boolean;
}

export default function TargetProgressBar({ done, total, compact }: Props) {
  const pct = Math.round((done / total) * 100);
  const allDone = done === total;

  return (
    <div className="space-y-1">
      {!compact && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Target progress</span>
          {allDone
            ? <span className="rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-green-800 dark:text-green-300 font-medium">Completed</span>
            : <span>{done} / {total}</span>
          }
        </div>
      )}
      <div
        className="h-2 w-full rounded-full bg-muted overflow-hidden"
        title={compact ? `${done} / ${total} targets` : undefined}
      >
        <div
          className="h-full rounded-full bg-indigo-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
bunx vitest run src/components/chores/TargetProgressBar.test.tsx
```
Expected: all 4 tests pass.

- [ ] **Step 5: Update ChoreCard to use the shared component**

Open `src/components/dashboard/ChoreCard.tsx`. Make these two changes:

**a) Add import** (after the existing imports):
```tsx
import TargetProgressBar from '@/components/chores/TargetProgressBar';
```

**b) Replace the `{targetProgress !== null && (...)}` block** (currently lines 97–118) with:
```tsx
{totalTargets > 0 && (
  <div className="mt-2">
    <TargetProgressBar done={doneTargets} total={totalTargets} compact={compact} />
  </div>
)}
```

Also remove the now-unused variables `targetProgress` and `allTargetsDone` (lines 51–52):
```typescript
// DELETE these two lines:
const targetProgress = totalTargets > 0 ? doneTargets / totalTargets : null;
const allTargetsDone = totalTargets > 0 && doneTargets === totalTargets;
```

- [ ] **Step 6: Run typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/chores/TargetProgressBar.tsx src/components/chores/TargetProgressBar.test.tsx src/components/dashboard/ChoreCard.tsx
git commit -m "feat: extract TargetProgressBar; change progress color to indigo-400"
```

---

### Task 3: Add `groupTargets` to completionsTable.ts (Bug 3 — helper)

**Files:**
- Modify: `src/components/chores/completionsTable.ts`
- Modify: `src/components/chores/completionsTable.test.ts`

`groupCompletions` (line 87) builds group keys via `JSON.stringify(groupBys.map(qId => getAnswerValue(completion, qId)))`. `groupTargets` is an identical pattern for `Target[]`. Both produce keys in the same format so they can be merged by key in ChorePage.

- [ ] **Step 1: Write failing tests**

Open `src/components/chores/completionsTable.test.ts`.

At the top of the file, add `Target` to the type imports. Find the existing type import line (it will look like `import type { Completion, Question, ... } from '@/types'`) and add `Target`:
```typescript
import type { Completion, Question, Answer, Target } from '@/types';
```

Also add `groupTargets` to the function import from `'./completionsTable'`:
```typescript
import { ..., groupTargets } from './completionsTable';
```

Then at the end of the file, add:

```typescript
describe('groupTargets', () => {
  const targets: Target[] = [
    { id: 't1', choreKey: 'p/c', order: 0, answers: [{ questionId: 'q1', value: 'A' }] },
    { id: 't2', choreKey: 'p/c', order: 1, answers: [{ questionId: 'q1', value: 'B' }] },
    { id: 't3', choreKey: 'p/c', order: 2, answers: [{ questionId: 'q1', value: 'A' }] },
    { id: 't4', choreKey: 'p/c', order: 3, answers: [] }, // no answer for q1 → null group
  ];

  it('groups targets with the same answer value together', () => {
    const groups = groupTargets(targets, ['q1']);
    expect(groups.get(JSON.stringify(['A']))?.map((t) => t.id)).toEqual(['t1', 't3']);
    expect(groups.get(JSON.stringify(['B']))?.map((t) => t.id)).toEqual(['t2']);
  });

  it('places targets with missing answers in the null-keyed group', () => {
    const groups = groupTargets(targets, ['q1']);
    expect(groups.get(JSON.stringify([null]))?.map((t) => t.id)).toEqual(['t4']);
  });

  it('produces a composite key for multiple groupBys', () => {
    const multi: Target[] = [
      { id: 'm1', choreKey: 'p/c', order: 0, answers: [{ questionId: 'q1', value: 'A' }, { questionId: 'q2', value: 1 }] },
      { id: 'm2', choreKey: 'p/c', order: 1, answers: [{ questionId: 'q1', value: 'A' }, { questionId: 'q2', value: 2 }] },
      { id: 'm3', choreKey: 'p/c', order: 2, answers: [{ questionId: 'q1', value: 'A' }, { questionId: 'q2', value: 1 }] },
    ];
    const groups = groupTargets(multi, ['q1', 'q2']);
    expect(groups.get(JSON.stringify(['A', 1]))?.map((t) => t.id)).toEqual(['m1', 'm3']);
    expect(groups.get(JSON.stringify(['A', 2]))?.map((t) => t.id)).toEqual(['m2']);
  });

  it('returns an empty map when given no targets', () => {
    expect(groupTargets([], ['q1']).size).toBe(0);
  });

  it('produces a key that matches groupCompletions for the same answer value', () => {
    const completion: Completion = {
      id: 'c1', choreKey: 'p/c', completedAt: '2026-01-01T00:00:00Z',
      xpEarned: 10, streak: 1,
      answers: [{ questionId: 'q1', value: 'A' }],
    };
    const target: Target = { id: 't1', choreKey: 'p/c', order: 0, answers: [{ questionId: 'q1', value: 'A' }] };
    const completionGroups = groupCompletions([completion], ['q1']);
    const targetGroups = groupTargets([target], ['q1']);
    // Same answer → same key → both maps have the same single key
    const completionKeys = Array.from(completionGroups.keys());
    const targetKeys = Array.from(targetGroups.keys());
    expect(targetKeys).toEqual(completionKeys);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
bunx vitest run src/components/chores/completionsTable.test.ts
```
Expected: FAIL — `groupTargets is not a function`.

- [ ] **Step 3: Add `groupTargets` to `completionsTable.ts`**

First, add `Target` to the import at line 2:
```typescript
import type { Completion, Question, Answer, EnumQuestion, Target } from '@/types';
```

Then add the following function immediately after the `groupCompletions` function (after line 96 — the closing brace of `groupCompletions`):

```typescript
export function groupTargets(targets: Target[], groupBys: string[]): Map<string, Target[]> {
  const groups = new Map<string, Target[]>();
  for (const t of targets) {
    const key = JSON.stringify(groupBys.map((qId) => t.answers.find((a) => a.questionId === qId)?.value ?? null));
    const existing = groups.get(key);
    if (existing) existing.push(t);
    else groups.set(key, [t]);
  }
  return groups;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
bunx vitest run src/components/chores/completionsTable.test.ts
```
Expected: all tests pass (including the 5 new `groupTargets` tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/chores/completionsTable.ts src/components/chores/completionsTable.test.ts
git commit -m "feat: add groupTargets to completionsTable"
```

---

### Task 4: Wire grouped targets into ChorePage (Bug 3 — UI)

**Files:**
- Modify: `src/components/chores/ChorePage.tsx`

When `groupBys` is active, targets are currently rendered as an ungrouped block at the bottom (the `{targetRows.map(...)}` block after the `Array.from(groupCompletions(...))` map). Replace this with per-group target rows using the new `groupTargets` helper.

**Read `src/components/chores/ChorePage.tsx` before editing** — the line numbers below are approximate.

- [ ] **Step 1: Add `groupTargets` and `Target` to the imports**

Find the line:
```typescript
import { groupCompletions, getGroupLabel, computeTotals, addGroupBy, removeGroupBy, isGroupableQuestion, exportCsv, exportJson, sortCompletions } from './completionsTable';
```
Replace with:
```typescript
import { groupCompletions, groupTargets, getGroupLabel, computeTotals, addGroupBy, removeGroupBy, isGroupableQuestion, exportCsv, exportJson, sortCompletions } from './completionsTable';
```

Find the line:
```typescript
import type { Answer, Completion } from '@/types';
```
Replace with:
```typescript
import type { Answer, Completion, Target } from '@/types';
```

- [ ] **Step 2: Replace the grouped `<>...</>` block inside `<tbody>`**

Find and replace the entire `<>` block that begins:
```tsx
) : (
  <>
    {Array.from(groupCompletions(sortedCompletions, groupBys)).map(([key, groupRows]) => {
```

…through the closing `</>`  (which also contains the `{targetRows.map(...)}` block at the end). Replace it with:

```tsx
) : (
  <>
    {(() => {
      const completionGroups = groupCompletions(sortedCompletions, groupBys);
      const targetGroups: Map<string, Target[]> = showTargets
        ? groupTargets(pendingTargets, groupBys)
        : new Map();
      const allKeys = Array.from(new Set([...completionGroups.keys(), ...targetGroups.keys()]));
      return allKeys.map((key) => {
        const groupRows = completionGroups.get(key) ?? [];
        const groupTargetRows = targetGroups.get(key) ?? [];
        const label = getGroupLabel(key, groupBys, choreQuestions);
        const subtotals = computeTotals(groupRows, choreQuestions);
        const isOpen = openGroup === key;

        const countParts: string[] = [];
        if (subtotals.count > 0) countParts.push(`${subtotals.count} completion${subtotals.count !== 1 ? 's' : ''}`);
        if (groupTargetRows.length > 0) countParts.push(`${groupTargetRows.length} target${groupTargetRows.length !== 1 ? 's' : ''}`);

        return (
          <React.Fragment key={key}>
            <tr
              data-group={key}
              data-group-open={isOpen}
              className="border-b border-border bg-muted/50 cursor-pointer select-none hover:bg-muted"
              onClick={() => setOpenGroup(isOpen ? null : key)}
            >
              <td colSpan={choreQuestions.length + 3} className="py-2 px-2 font-medium">
                <span className="mr-2">{isOpen ? '▾' : '▸'}</span>
                {label}
                <span className="ml-3 text-xs font-normal text-muted-foreground">
                  ({countParts.join(' · ')}{subtotals.count > 0 ? ` · ${subtotals.xpSum} XP` : ''})
                </span>
              </td>
            </tr>
            {isOpen && groupRows.map((c) => (
              <tr key={c.id} className="border-b border-border hover:bg-muted">
                <th scope="row" className="py-2 pr-4 text-muted-foreground whitespace-nowrap font-normal pl-6">{formatDate(c.completedAt)}</th>
                {choreQuestions.map((q) => (
                  <td key={q.id} className="py-2 pr-4 text-muted-foreground">{getAnswerDisplay(c.answers, q)}</td>
                ))}
                <td className="py-2 text-foreground font-medium text-right">{c.xpEarned}</td>
                <td className="py-2 pl-4">
                  <div className="flex justify-end gap-2">
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                      onClick={() => setEditingCompletion(c)}
                    >
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {isOpen && groupTargetRows.map((t) => (
              <tr key={t.id} className="border-b border-border opacity-40">
                <th scope="row" className="py-2 pr-4 text-muted-foreground whitespace-nowrap font-normal pl-6">—</th>
                {choreQuestions.map((q) => (
                  <td key={q.id} className="py-2 pr-4 text-muted-foreground">{getAnswerDisplay(t.answers, q)}</td>
                ))}
                <td className="py-2 text-foreground font-medium text-right">—</td>
                <td className="py-2 pl-4" />
              </tr>
            ))}
          </React.Fragment>
        );
      });
    })()}
  </>
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/chores/ChorePage.tsx
git commit -m "fix: include targets in ChorePage grouped view with per-group target counts"
```

---

### Task 5: Restore totals row below the table in ChorePage (Bug 4)

**Files:**
- Modify: `src/components/chores/ChorePage.tsx`

`CompletionsTable.tsx` has a `<tfoot>` with completion count, question sums, and XP total. `ChorePage.tsx` was rewritten without it. Add it back. When targets are visible, show their count alongside completions in the first cell.

- [ ] **Step 1: Add totals computation**

In `ChorePage.tsx`, find the line:
```typescript
const hasSorts = sorts.length > 0;
```
Add this line directly after it:
```typescript
const totals = computeTotals(completions, choreQuestions);
```

- [ ] **Step 2: Add `<tfoot>` after `</tbody>`**

Find the closing sequence:
```tsx
          </tbody>
        </table>
      </div>
```

Replace with:
```tsx
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-medium bg-muted/30">
              <th scope="row" className="py-2 pr-4 text-foreground whitespace-nowrap text-left">
                {[
                  `${completions.length} completion${completions.length !== 1 ? 's' : ''}`,
                  showTargets && pendingTargets.length > 0
                    ? `${pendingTargets.length} target${pendingTargets.length !== 1 ? 's' : ''}`
                    : null,
                ].filter(Boolean).join(' · ')}
              </th>
              {choreQuestions.map((q) => (
                <td key={q.id} className="py-2 pr-4 text-foreground">
                  {totals.questionSums[q.id] !== null ? totals.questionSums[q.id] : '—'}
                </td>
              ))}
              <td className="py-2 text-foreground font-medium text-right">{totals.xpSum}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/chores/ChorePage.tsx
git commit -m "fix: restore totals row below the table in ChorePage"
```

---

### Task 6: Add target progress bar to ChorePage (Bug 5)

**Files:**
- Modify: `src/components/chores/ChorePage.tsx`

Show a target progress bar on the chore details page whenever there are targets (same as ChoreCard). Place it above the toolbar, inside the `allRows.length > 0` branch. Uses `TargetProgressBar` from Task 2.

- [ ] **Step 1: Add import**

At the top of `ChorePage.tsx`, add:
```typescript
import TargetProgressBar from '@/components/chores/TargetProgressBar';
```

- [ ] **Step 2: Insert the progress bar**

Find this comment inside the `allRows.length > 0` branch:
```tsx
          {/* Toolbar: Group by + Export */}
```

Insert directly before that comment:
```tsx
          {targets.length > 0 && (
            <div className="mb-3">
              <TargetProgressBar
                done={targets.length - pendingTargets.length}
                total={targets.length}
              />
            </div>
          )}
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
bun run test
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/chores/ChorePage.tsx
git commit -m "fix: add target progress bar to ChorePage"
```
