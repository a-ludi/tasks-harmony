# Chore Details & Data Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add card controls to ChorePage, and build a CompletionsTable with multi-column sort, compound group-by, totals, and CSV/JSON export.

**Architecture:** Extract three self-contained card-control components (`CompleteButton`, `QuickCompleteButtonList`, `ChoreActionsDropdown`) that derive their own status from the store. A new `CompletionsTable` component owns all table logic; pure sorting/grouping/export functions live in `completionsTable.ts` and are unit-tested in isolation.

**Tech Stack:** TypeScript, React, Zustand (`useAppStore`/`useShallow`), Tailwind CSS, shadcn/ui (`Button`, `DropdownMenu`, `Dialog`, `Tooltip`), Vitest, @testing-library/react, Playwright

---

## File Map

| File | Status | Purpose |
|---|---|---|
| `src/components/chores/ChoreActionsDropdown.tsx` | **Create** | ⋮ dropdown (Edit/Duplicate/Archive/Delete) + modals |
| `src/components/chores/QuickCompleteButton.tsx` | **Create** | Single quick-answer button with tooltip |
| `src/components/chores/QuickCompleteButtonList.tsx` | **Create** | List of quick-answer buttons, status-aware |
| `src/components/chores/completionsTable.ts` | **Create** | Pure sort/group/totals/export logic |
| `src/components/chores/CompletionsTable.tsx` | **Create** | Table component with sort, group, totals, export |
| `src/components/chores/completionsTable.test.ts` | **Create** | Unit tests for all pure logic |
| `src/components/chores/CompleteButton.test.tsx` | **Create** | Component tests for CompleteButton |
| `src/components/chores/QuickCompleteButtonList.test.tsx` | **Create** | Component tests for QuickCompleteButtonList |
| `src/components/chores/CompletionsTable.test.tsx` | **Create** | Component tests for CompletionsTable |
| `src/components/chores/CompleteButton.tsx` | **Modify** | Refactor props: `chore` + `disabled?`, status-derived |
| `src/components/dashboard/ChoreCard.tsx` | **Modify** | Use new reusable components |
| `src/components/chores/ChorePage.tsx` | **Modify** | Add controls bar, use CompletionsTable |

---

## Task 1: Extract `ChoreActionsDropdown`

**Files:**
- Create: `src/components/chores/ChoreActionsDropdown.tsx`
- Modify: `src/components/dashboard/ChoreCard.tsx`

- [ ] **Step 1: Create ChoreActionsDropdown**

```tsx
// src/components/chores/ChoreActionsDropdown.tsx
import { useState } from 'react';
import { useAppStore } from '@/store';
import type { Chore } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import ChoreFormModal from './ChoreFormModal';
import DuplicateChoreDialog from './DuplicateChoreDialog';

interface Props {
  chore: Chore;
}

export default function ChoreActionsDropdown({ chore }: Props) {
  const deactivateChore = useAppStore((s) => s.deactivateChore);
  const deleteChore = useAppStore((s) => s.deleteChore);
  const allChores = useAppStore((s) => s.chores);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [editAfterDuplicateKey, setEditAfterDuplicateKey] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isArchived = !chore.active;

  async function handleDeactivate() {
    if (window.confirm(`Archive "${chore.title}"? It will be removed from the dashboard.`)) {
      await deactivateChore(chore.key);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteChore(chore.key);
      setShowDeleteDialog(false);
    } catch (err) {
      console.error('Failed to delete chore:', err);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Chore actions">⋮</Button>
        </DropdownMenuTrigger>
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
      </DropdownMenu>

      {showEditModal && <ChoreFormModal chore={chore} packId={chore.packId} onClose={() => setShowEditModal(false)} />}
      {showDuplicateDialog && (
        <DuplicateChoreDialog
          chore={chore}
          onClose={() => setShowDuplicateDialog(false)}
          onDuplicateAndEdit={(newKey) => { setShowDuplicateDialog(false); setEditAfterDuplicateKey(newKey); }}
        />
      )}
      {editAfterDuplicateKey && (() => {
        const dupeChore = allChores.find((c) => c.key === editAfterDuplicateKey);
        return dupeChore ? <ChoreFormModal chore={dupeChore} packId={dupeChore.packId} onClose={() => setEditAfterDuplicateKey(null)} /> : null;
      })()}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => { if (!deleting) setShowDeleteDialog(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete chore?</DialogTitle>
            <DialogDescription>
              All completion history for <strong>{chore.title}</strong> will be permanently deleted.
              Your total XP earned is preserved. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Update ChoreCard to use ChoreActionsDropdown**

Replace the `DropdownMenu` block, all three modal renders, and the delete `Dialog` at the bottom of `ChoreCard` with:

```tsx
import ChoreActionsDropdown from '@/components/chores/ChoreActionsDropdown';

// In JSX, replace the DropdownMenu + modals + Dialog with:
<ChoreActionsDropdown chore={chore} />
```

Remove the now-unused state and handlers: `showEditModal`, `setShowEditModal`, `showDuplicateDialog`, `setShowDuplicateDialog`, `editAfterDuplicateKey`, `setEditAfterDuplicateKey`, `showDeleteDialog`, `setShowDeleteDialog`, `deleting`, `setDeleting`, `handleDelete`, `handleDeactivate`, `allChores`, `deleteChore`, `deactivateChore`.

- [ ] **Step 3: Typecheck**

```
bun run typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/chores/ChoreActionsDropdown.tsx src/components/dashboard/ChoreCard.tsx
git commit -m "refactor: extract ChoreActionsDropdown from ChoreCard"
```

---

## Task 2: Create `QuickCompleteButton` and `QuickCompleteButtonList`

**Files:**
- Create: `src/components/chores/QuickCompleteButton.tsx`
- Create: `src/components/chores/QuickCompleteButtonList.tsx`
- Create: `src/components/chores/QuickCompleteButtonList.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/chores/QuickCompleteButtonList.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAppStore } from '@/store';
import QuickCompleteButtonList from './QuickCompleteButtonList';
import type { Chore } from '@/types';

vi.mock('@/store');
const mockUseAppStore = vi.mocked(useAppStore);

const chore: Chore = {
  key: 'pack/chore', choreId: 'chore', packId: 'pack', title: 'Test',
  xpSize: 'M', repeatable: false, active: true, createdAt: '2026-01-01T00:00:00Z',
  recurrence: { frequency: 'daily', interval: 1, startDate: '2020-01-01', windowStartTime: '00:00' },
};

function mockStore(overrides = {}) {
  const state = {
    completions: [],
    questions: [],
    quickAnswerSets: [],
    recordCompletion: vi.fn(),
    packs: [],
    ...overrides,
  };
  mockUseAppStore.mockImplementation((selector: (s: typeof state) => unknown) => selector(state));
}

describe('QuickCompleteButtonList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when no quick answer sets', () => {
    mockStore();
    const { container } = render(<QuickCompleteButtonList chore={chore} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when status is upcoming (no completions, future start)', () => {
    mockStore({
      quickAnswerSets: [{ id: 'qs1', choreKey: chore.key, label: 'Quick', answers: [] }],
    });
    const upcomingChore = { ...chore, recurrence: { ...chore.recurrence, startDate: '2099-01-01' } };
    const { container } = render(<QuickCompleteButtonList chore={upcomingChore} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders buttons when status is due and sets exist', () => {
    mockStore({
      quickAnswerSets: [{ id: 'qs1', choreKey: chore.key, label: 'Quick', answers: [] }],
    });
    render(<QuickCompleteButtonList chore={chore} />);
    expect(screen.getByText('⚡ Quick')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect it to fail**

```
bun run test -- src/components/chores/QuickCompleteButtonList.test.tsx
```
Expected: FAIL (module not found).

- [ ] **Step 3: Create QuickCompleteButton**

```tsx
// src/components/chores/QuickCompleteButton.tsx
import { useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { useAppStore } from '@/store';
import type { Chore, QuickAnswerSet } from '@/types';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getAnswerDisplay } from '@/questions/display';

interface Props {
  set: QuickAnswerSet;
  chore: Chore;
  disabled?: boolean;
}

export default function QuickCompleteButton({ set, chore, disabled }: Props) {
  const recordCompletion = useAppStore((s) => s.recordCompletion);
  const questions = useAppStore(useShallow((s) => s.questions.filter((q) => q.choreKey === chore.key)));
  const [processing, setProcessing] = useState(false);

  async function handleClick() {
    if (processing || disabled) return;
    setProcessing(true);
    try { await recordCompletion(chore.key, set.answers); } finally { setProcessing(false); }
  }

  const tooltipRows = [...questions].sort((a, b) => a.order - b.order).map((q) => ({
    prompt: q.prompt,
    display: getAnswerDisplay(set.answers, q) || '—',
  }));

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClick}
          disabled={disabled || processing}
          className="rounded-full border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-800/30"
        >
          {processing ? 'Saving…' : `⚡ ${set.label}`}
        </Button>
      </TooltipTrigger>
      {tooltipRows.length > 0 && (
        <TooltipContent>
          <p className="mb-1 text-xs font-semibold">{set.label}</p>
          {tooltipRows.map((row) => (
            <div key={row.prompt} className="flex justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{row.prompt}</span>
              <span className="font-medium">{row.display}</span>
            </div>
          ))}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
```

- [ ] **Step 4: Create QuickCompleteButtonList**

```tsx
// src/components/chores/QuickCompleteButtonList.tsx
import { useShallow } from 'zustand/shallow';
import { useAppStore } from '@/store';
import type { Chore } from '@/types';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getChoreStatus } from '@/chores/recurrence';
import QuickCompleteButton from './QuickCompleteButton';

interface Props {
  chore: Chore;
  disabled?: boolean;
}

export default function QuickCompleteButtonList({ chore, disabled }: Props) {
  const quickAnswerSets = useAppStore(useShallow((s) => s.quickAnswerSets.filter((s) => s.choreKey === chore.key)));
  const completions = useAppStore(useShallow((s) => s.completions.filter((c) => c.choreKey === chore.key)));

  if (quickAnswerSets.length === 0) return null;

  const status = getChoreStatus(chore, completions, new Date());
  const actionable = status === 'due' || status === 'overdue' || (status === 'completed' && chore.repeatable);
  if (!actionable) return null;

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-2">
        {quickAnswerSets.map((set) => (
          <QuickCompleteButton key={set.id} set={set} chore={chore} disabled={disabled} />
        ))}
      </div>
    </TooltipProvider>
  );
}
```

- [ ] **Step 5: Run tests — expect them to pass**

```
bun run test -- src/components/chores/QuickCompleteButtonList.test.tsx
```
Expected: PASS (3 tests).

- [ ] **Step 6: Update ChoreCard to use QuickCompleteButtonList**

Replace the `{!isArchived && quickAnswerSets.length > 0 && ...}` block in `ChoreCard` with:

```tsx
import QuickCompleteButtonList from '@/components/chores/QuickCompleteButtonList';

// In CardContent, replace the quickAnswerSets block:
<QuickCompleteButtonList chore={chore} disabled={isArchived} />
```

Remove now-unused: `quickAnswerSets`, `quickCompleting`, `setQuickCompleting`, `handleQuickComplete`, `questions`, `recordCompletion` (unless used elsewhere), `TooltipProvider`, `Tooltip`, `TooltipContent`, `TooltipTrigger` imports.

- [ ] **Step 7: Typecheck and commit**

```
bun run typecheck
git add src/components/chores/QuickCompleteButton.tsx src/components/chores/QuickCompleteButtonList.tsx src/components/chores/QuickCompleteButtonList.test.tsx src/components/dashboard/ChoreCard.tsx
git commit -m "feat: extract QuickCompleteButton and QuickCompleteButtonList"
```

---

## Task 3: Refactor `CompleteButton`

**Files:**
- Modify: `src/components/chores/CompleteButton.tsx`
- Create: `src/components/chores/CompleteButton.test.tsx`
- Modify: `src/components/dashboard/ChoreCard.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/chores/CompleteButton.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAppStore } from '@/store';
import CompleteButton from './CompleteButton';
import type { Chore } from '@/types';

vi.mock('@/store');
const mockUseAppStore = vi.mocked(useAppStore);

const baseChore: Chore = {
  key: 'pack/chore', choreId: 'chore', packId: 'pack', title: 'Test',
  xpSize: 'M', repeatable: false, active: true, createdAt: '2026-01-01T00:00:00Z',
  recurrence: { frequency: 'daily', interval: 1, startDate: '2020-01-01', windowStartTime: '00:00' },
};

function mockStore(overrides = {}) {
  const state = { completions: [], questions: [], recordCompletion: vi.fn(), ...overrides };
  mockUseAppStore.mockImplementation((selector: (s: typeof state) => unknown) => selector(state));
}

describe('CompleteButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when status is upcoming', () => {
    mockStore();
    const upcomingChore = { ...baseChore, recurrence: { ...baseChore.recurrence, startDate: '2099-01-01' } };
    const { container } = render(<CompleteButton chore={upcomingChore} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows Complete button when due', () => {
    mockStore();
    render(<CompleteButton chore={baseChore} />);
    expect(screen.getByRole('button', { name: 'Complete' })).toBeInTheDocument();
  });

  it('shows Complete again when completed and repeatable', () => {
    const completedAt = new Date().toISOString();
    mockStore({ completions: [{ id: '1', choreKey: baseChore.key, completedAt, xpEarned: 10, streak: 1, answers: [] }] });
    const repeatableChore = { ...baseChore, repeatable: true };
    render(<CompleteButton chore={repeatableChore} />);
    expect(screen.getByRole('button', { name: 'Complete again' })).toBeInTheDocument();
  });

  it('renders nothing when completed and not repeatable', () => {
    const completedAt = new Date().toISOString();
    mockStore({ completions: [{ id: '1', choreKey: baseChore.key, completedAt, xpEarned: 10, streak: 1, answers: [] }] });
    const { container } = render(<CompleteButton chore={baseChore} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test — expect it to fail**

```
bun run test -- src/components/chores/CompleteButton.test.tsx
```
Expected: FAIL (props mismatch — current CompleteButton takes `choreKey`).

- [ ] **Step 3: Refactor CompleteButton**

```tsx
// src/components/chores/CompleteButton.tsx
import { useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { useAppStore } from '@/store';
import type { Chore } from '@/types';
import { Button } from '@/components/ui/button';
import { getChoreStatus } from '@/chores/recurrence';
import CompletionModal from '@/components/completion/CompletionModal';

interface Props {
  chore: Chore;
  disabled?: boolean;
}

export default function CompleteButton({ chore, disabled }: Props) {
  const recordCompletion = useAppStore((s) => s.recordCompletion);
  const questions = useAppStore(useShallow((s) => s.questions.filter((q) => q.choreKey === chore.key)));
  const completions = useAppStore(useShallow((s) => s.completions.filter((c) => c.choreKey === chore.key)));
  const [processing, setProcessing] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const status = getChoreStatus(chore, completions, new Date());
  const showComplete = status === 'due' || status === 'overdue';
  const showCompleteAgain = status === 'completed' && chore.repeatable;

  if (!showComplete && !showCompleteAgain) return null;

  const label = showCompleteAgain ? 'Complete again' : 'Complete';

  async function handleClick() {
    if (processing || disabled) return;
    if (questions.length > 0) { setShowModal(true); return; }
    setProcessing(true);
    try { await recordCompletion(chore.key); } finally { setProcessing(false); }
  }

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={disabled || processing}
        size="sm"
        className="bg-green-600 hover:bg-green-700 text-white disabled:bg-green-600 disabled:opacity-50"
      >
        {processing ? 'Saving…' : label}
      </Button>
      {showModal && (
        <CompletionModal choreKey={chore.key} questions={questions} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
```

- [ ] **Step 4: Run tests — expect them to pass**

```
bun run test -- src/components/chores/CompleteButton.test.tsx
```
Expected: PASS (4 tests).

- [ ] **Step 5: Update ChoreCard to use new CompleteButton API**

In `ChoreCard`, replace:
```tsx
{(status === 'due' || status === 'overdue') && <CompleteButton choreKey={chore.key} disabled={isArchived} />}
{status === 'completed' && chore.repeatable && <CompleteButton choreKey={chore.key} label="Complete again" disabled={isArchived} />}
```
with:
```tsx
<CompleteButton chore={chore} disabled={isArchived} />
```

- [ ] **Step 6: Typecheck and commit**

```
bun run typecheck
git add src/components/chores/CompleteButton.tsx src/components/chores/CompleteButton.test.tsx src/components/dashboard/ChoreCard.tsx
git commit -m "refactor: CompleteButton derives status from store, drops choreKey prop"
```

---

## Task 4: Add controls bar to `ChorePage`

**Files:**
- Modify: `src/components/chores/ChorePage.tsx`

- [ ] **Step 1: Add controls bar**

After the description block and before `<h2>Completion History</h2>`, insert:

```tsx
import CompleteButton from '@/components/chores/CompleteButton';
import QuickCompleteButtonList from '@/components/chores/QuickCompleteButtonList';
import ChoreActionsDropdown from '@/components/chores/ChoreActionsDropdown';

// In JSX, between description and h2:
<div className="flex flex-wrap items-center gap-2 mb-6">
  <CompleteButton chore={chore} />
  <QuickCompleteButtonList chore={chore} />
  <ChoreActionsDropdown chore={chore} />
</div>
```

- [ ] **Step 2: Typecheck and commit**

```
bun run typecheck
git add src/components/chores/ChorePage.tsx
git commit -m "feat: add card controls bar to ChorePage"
```

---

## Task 5: Pure logic — `completionsTable.ts`

**Files:**
- Create: `src/components/chores/completionsTable.ts`
- Create: `src/components/chores/completionsTable.test.ts`

- [ ] **Step 1: Write failing tests for sort, group, and totals**

```ts
// src/components/chores/completionsTable.test.ts
import { describe, it, expect } from 'vitest';
import {
  sortCompletions, getGroupKey, groupCompletions, getGroupLabel,
  computeTotals, addGroupBy, removeGroupBy, clickColumnHeader,
  buildCsvRows, buildCsvHeaders, buildJsonData,
} from './completionsTable';
import type { Completion, Question, EnumQuestion, IntegerQuestion } from '@/types';

const mkCompletion = (overrides: Partial<Completion> = {}): Completion => ({
  id: 'c1', choreKey: 'k', completedAt: '2026-01-01T12:00:00Z',
  xpEarned: 100, streak: 1, answers: [], ...overrides,
});

const mkEnumQ = (overrides: Partial<EnumQuestion> = {}): EnumQuestion => ({
  id: 'q1', choreKey: 'k', prompt: 'Mood', required: false, order: 1, type: 'ENUM',
  choices: [
    { id: 'c1', label: 'Happy', order: 1 },
    { id: 'c2', label: 'Sad', order: 2 },
  ],
  ...overrides,
});

const mkIntQ = (overrides: Partial<IntegerQuestion> = {}): IntegerQuestion => ({
  id: 'q2', choreKey: 'k', prompt: 'Count', required: false, order: 2, type: 'INTEGER', ...overrides,
});

// --- Sort ---
describe('sortCompletions', () => {
  it('sorts by completedAt asc', () => {
    const a = mkCompletion({ id: 'a', completedAt: '2026-01-01T00:00:00Z' });
    const b = mkCompletion({ id: 'b', completedAt: '2026-01-02T00:00:00Z' });
    expect(sortCompletions([b, a], [{ key: 'completedAt', dir: 'asc' }], [])).toEqual([a, b]);
  });

  it('sorts by completedAt desc', () => {
    const a = mkCompletion({ id: 'a', completedAt: '2026-01-01T00:00:00Z' });
    const b = mkCompletion({ id: 'b', completedAt: '2026-01-02T00:00:00Z' });
    expect(sortCompletions([a, b], [{ key: 'completedAt', dir: 'desc' }], [])).toEqual([b, a]);
  });

  it('sorts by xpEarned asc', () => {
    const a = mkCompletion({ id: 'a', xpEarned: 50 });
    const b = mkCompletion({ id: 'b', xpEarned: 200 });
    expect(sortCompletions([b, a], [{ key: 'xpEarned', dir: 'asc' }], [])).toEqual([a, b]);
  });

  it('sorts by INTEGER question value, null last', () => {
    const q = mkIntQ();
    const a = mkCompletion({ id: 'a', answers: [{ questionId: 'q2', value: 3 }] });
    const b = mkCompletion({ id: 'b', answers: [{ questionId: 'q2', value: 7 }] });
    const c = mkCompletion({ id: 'c', answers: [{ questionId: 'q2', value: null }] });
    expect(sortCompletions([c, b, a], [{ key: 'question:q2', dir: 'asc' }], [q])).toEqual([a, b, c]);
  });

  it('sorts by ENUM question by choice.order', () => {
    const q = mkEnumQ();
    const happy = mkCompletion({ id: 'h', answers: [{ questionId: 'q1', value: 'c1' }] });
    const sad = mkCompletion({ id: 's', answers: [{ questionId: 'q1', value: 'c2' }] });
    expect(sortCompletions([sad, happy], [{ key: 'question:q1', dir: 'asc' }], [q])).toEqual([happy, sad]);
  });

  it('applies multi-column sort with tiebreaking', () => {
    const q = mkEnumQ();
    const a = mkCompletion({ id: 'a', xpEarned: 100, answers: [{ questionId: 'q1', value: 'c1' }] });
    const b = mkCompletion({ id: 'b', xpEarned: 200, answers: [{ questionId: 'q1', value: 'c1' }] });
    const c = mkCompletion({ id: 'c', xpEarned: 50, answers: [{ questionId: 'q1', value: 'c2' }] });
    const result = sortCompletions([c, b, a], [
      { key: 'question:q1', dir: 'asc' },
      { key: 'xpEarned', dir: 'asc' },
    ], [q]);
    expect(result).toEqual([a, b, c]);
  });

  it('returns original order when sorts is empty', () => {
    const a = mkCompletion({ id: 'a' });
    const b = mkCompletion({ id: 'b' });
    expect(sortCompletions([a, b], [], [])).toEqual([a, b]);
  });
});

// --- Group key ---
describe('getGroupKey', () => {
  it('serialises single groupBy answer value', () => {
    const c = mkCompletion({ answers: [{ questionId: 'q1', value: 'c1' }] });
    expect(getGroupKey(c, ['q1'])).toBe(JSON.stringify(['c1']));
  });

  it('serialises compound groupBy tuple', () => {
    const c = mkCompletion({ answers: [{ questionId: 'q1', value: 'c1' }, { questionId: 'q2', value: 3 }] });
    expect(getGroupKey(c, ['q1', 'q2'])).toBe(JSON.stringify(['c1', 3]));
  });

  it('uses null for missing answer', () => {
    const c = mkCompletion({ answers: [] });
    expect(getGroupKey(c, ['q1'])).toBe(JSON.stringify([null]));
  });

  it('same key for same values', () => {
    const a = mkCompletion({ id: 'a', answers: [{ questionId: 'q1', value: 'c1' }] });
    const b = mkCompletion({ id: 'b', answers: [{ questionId: 'q1', value: 'c1' }] });
    expect(getGroupKey(a, ['q1'])).toBe(getGroupKey(b, ['q1']));
  });

  it('different key for different values', () => {
    const a = mkCompletion({ id: 'a', answers: [{ questionId: 'q1', value: 'c1' }] });
    const b = mkCompletion({ id: 'b', answers: [{ questionId: 'q1', value: 'c2' }] });
    expect(getGroupKey(a, ['q1'])).not.toBe(getGroupKey(b, ['q1']));
  });
});

describe('groupCompletions', () => {
  it('groups into a Map keyed by tuple', () => {
    const a = mkCompletion({ id: 'a', answers: [{ questionId: 'q1', value: 'c1' }] });
    const b = mkCompletion({ id: 'b', answers: [{ questionId: 'q1', value: 'c2' }] });
    const c = mkCompletion({ id: 'c', answers: [{ questionId: 'q1', value: 'c1' }] });
    const groups = groupCompletions([a, b, c], ['q1']);
    expect(groups.size).toBe(2);
    expect(groups.get(JSON.stringify(['c1']))).toEqual([a, c]);
    expect(groups.get(JSON.stringify(['c2']))).toEqual([b]);
  });
});

// --- Totals ---
describe('computeTotals', () => {
  it('counts completions for completedAt', () => {
    const cs = [mkCompletion({ id: 'a' }), mkCompletion({ id: 'b' })];
    expect(computeTotals(cs, []).count).toBe(2);
  });

  it('sums xpEarned', () => {
    const cs = [mkCompletion({ xpEarned: 100 }), mkCompletion({ xpEarned: 50 })];
    expect(computeTotals(cs, []).xpSum).toBe(150);
  });

  it('sums INTEGER question answers, treating null as 0', () => {
    const q = mkIntQ();
    const cs = [
      mkCompletion({ answers: [{ questionId: 'q2', value: 5 }] }),
      mkCompletion({ answers: [{ questionId: 'q2', value: null }] }),
    ];
    expect(computeTotals(cs, [q]).questionSums['q2']).toBe(5);
  });

  it('returns null sum for ENUM question', () => {
    const q = mkEnumQ();
    const cs = [mkCompletion({ answers: [{ questionId: 'q1', value: 'c1' }] })];
    expect(computeTotals(cs, [q]).questionSums['q1']).toBeNull();
  });
});

// --- Sort/group invariant ---
describe('addGroupBy', () => {
  it('adds new column to groupBys and groupSorts with asc', () => {
    const result = addGroupBy([], [], 'q1');
    expect(result.groupBys).toEqual(['q1']);
    expect(result.sorts).toEqual([{ key: 'question:q1', dir: 'asc' }]);
  });

  it('inserts new groupSort before extraSorts', () => {
    const sorts = [{ key: 'question:q1' as const, dir: 'asc' as const }, { key: 'xpEarned' as const, dir: 'desc' as const }];
    const result = addGroupBy(['q1'], sorts, 'q2');
    expect(result.sorts).toEqual([
      { key: 'question:q1', dir: 'asc' },
      { key: 'question:q2', dir: 'asc' },
      { key: 'xpEarned', dir: 'desc' },
    ]);
  });

  it('moves existing extraSort to groupSorts, preserving direction', () => {
    const sorts = [{ key: 'question:q1' as const, dir: 'desc' as const }];
    const result = addGroupBy([], sorts, 'q1');
    expect(result.sorts).toEqual([{ key: 'question:q1', dir: 'desc' }]);
  });
});

describe('removeGroupBy', () => {
  it('removes column from groupBys and sorts', () => {
    const sorts = [{ key: 'question:q1' as const, dir: 'asc' as const }, { key: 'xpEarned' as const, dir: 'asc' as const }];
    const result = removeGroupBy(['q1'], sorts, 'q1');
    expect(result.groupBys).toEqual([]);
    expect(result.sorts).toEqual([{ key: 'xpEarned', dir: 'asc' }]);
  });
});

describe('clickColumnHeader', () => {
  it('adds unsorted non-grouped column as asc', () => {
    expect(clickColumnHeader([], 'xpEarned', [])).toEqual([{ key: 'xpEarned', dir: 'asc' }]);
  });

  it('asc → desc', () => {
    const sorts = [{ key: 'xpEarned' as const, dir: 'asc' as const }];
    expect(clickColumnHeader(sorts, 'xpEarned', [])).toEqual([{ key: 'xpEarned', dir: 'desc' }]);
  });

  it('desc → removed', () => {
    const sorts = [{ key: 'xpEarned' as const, dir: 'desc' as const }];
    expect(clickColumnHeader(sorts, 'xpEarned', [])).toEqual([]);
  });

  it('adds unsorted grouped column into groupSorts zone before extraSorts', () => {
    const sorts = [{ key: 'xpEarned' as const, dir: 'asc' as const }];
    const result = clickColumnHeader(sorts, 'question:q1', ['q1']);
    expect(result).toEqual([
      { key: 'question:q1', dir: 'asc' },
      { key: 'xpEarned', dir: 'asc' },
    ]);
  });
});

// --- Export data builders ---
describe('buildCsvHeaders', () => {
  it('includes two columns for ENUM questions', () => {
    const q = mkEnumQ();
    const headers = buildCsvHeaders([q]);
    expect(headers).toEqual(['completedAt', 'streak', 'Mood', 'Mood (index)', 'xpEarned']);
  });

  it('includes one column for INTEGER questions', () => {
    const q = mkIntQ();
    const headers = buildCsvHeaders([q]);
    expect(headers).toEqual(['completedAt', 'streak', 'Count', 'xpEarned']);
  });
});

describe('buildCsvRows', () => {
  it('outputs chronological order regardless of input order', () => {
    const a = mkCompletion({ id: 'a', completedAt: '2026-01-01T00:00:00Z' });
    const b = mkCompletion({ id: 'b', completedAt: '2026-01-02T00:00:00Z' });
    const rows = buildCsvRows([b, a], []);
    expect(rows[0][0]).toContain('Jan 1');
    expect(rows[1][0]).toContain('Jan 2');
  });

  it('includes enumIndex column for ENUM questions', () => {
    const q = mkEnumQ();
    const c = mkCompletion({ answers: [{ questionId: 'q1', value: 'c1' }] });
    const rows = buildCsvRows([c], [q]);
    // columns: completedAt, streak, Mood (display), Mood (index), xpEarned
    expect(rows[0][2]).toBe('Happy');
    expect(rows[0][3]).toBe('1'); // choice.order for 'c1'
  });

  it('uses empty string for null answer', () => {
    const q = mkIntQ();
    const c = mkCompletion({ answers: [{ questionId: 'q2', value: null }] });
    const rows = buildCsvRows([c], [q]);
    expect(rows[0][2]).toBe('');
  });
});

describe('buildJsonData', () => {
  it('includes enumIndex only for ENUM answers', () => {
    const enumQ = mkEnumQ();
    const intQ = mkIntQ();
    const c = mkCompletion({ answers: [{ questionId: 'q1', value: 'c1' }, { questionId: 'q2', value: 5 }] });
    const data = buildJsonData([c], [enumQ, intQ]);
    const moodAnswer = data[0].answers.find(a => a.prompt === 'Mood')!;
    const countAnswer = data[0].answers.find(a => a.prompt === 'Count')!;
    expect(moodAnswer.enumIndex).toBe(1);
    expect('enumIndex' in countAnswer).toBe(false);
  });

  it('outputs chronological order', () => {
    const a = mkCompletion({ id: 'a', completedAt: '2026-01-01T00:00:00Z' });
    const b = mkCompletion({ id: 'b', completedAt: '2026-01-02T00:00:00Z' });
    const data = buildJsonData([b, a], []);
    expect(data[0].completedAt).toBe('2026-01-01T00:00:00Z');
  });
});
```

- [ ] **Step 2: Run tests — expect them to fail**

```
bun run test -- src/components/chores/completionsTable.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Create completionsTable.ts**

```ts
// src/components/chores/completionsTable.ts
import type { Completion, Question, Answer, EnumQuestion } from '@/types';
import { getAnswerDisplay } from '@/questions/display';

export type SortDir = 'asc' | 'desc';
export type SortKey = 'completedAt' | `question:${string}` | 'xpEarned';
export interface SortEntry { key: SortKey; dir: SortDir; }

export interface TotalsRow {
  count: number;
  xpSum: number;
  questionSums: Record<string, number | null>;
}

export interface JsonCompletionAnswer {
  prompt: string;
  value: string;
  enumIndex?: number;
}

export interface JsonCompletion {
  completedAt: string;
  xpEarned: number;
  streak: number;
  answers: JsonCompletionAnswer[];
}

function questionIdFromKey(key: SortKey): string | null {
  return key.startsWith('question:') ? key.slice('question:'.length) : null;
}

function getAnswerValue(c: Completion, qId: string): string | number | boolean | null {
  return c.answers.find(a => a.questionId === qId)?.value ?? null;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  return String(a).localeCompare(String(b));
}

function compareByKey(a: Completion, b: Completion, key: SortKey, dir: SortDir, questions: Question[]): number {
  let result = 0;
  if (key === 'completedAt') {
    result = new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
  } else if (key === 'xpEarned') {
    result = a.xpEarned - b.xpEarned;
  } else {
    const qId = questionIdFromKey(key)!;
    const q = questions.find(q => q.id === qId);
    const av = getAnswerValue(a, qId);
    const bv = getAnswerValue(b, qId);
    if (q?.type === 'ENUM') {
      const choices = (q as EnumQuestion).choices ?? [];
      const aOrder = av === null ? Infinity : (choices.find(c => c.id === String(av))?.order ?? Infinity);
      const bOrder = bv === null ? Infinity : (choices.find(c => c.id === String(bv))?.order ?? Infinity);
      result = aOrder - bOrder;
    } else {
      result = compareValues(av, bv);
    }
  }
  return dir === 'asc' ? result : -result;
}

export function sortCompletions(completions: Completion[], sorts: SortEntry[], questions: Question[]): Completion[] {
  if (sorts.length === 0) return completions;
  return [...completions].sort((a, b) => {
    for (const sort of sorts) {
      const r = compareByKey(a, b, sort.key, sort.dir, questions);
      if (r !== 0) return r;
    }
    return 0;
  });
}

export function getGroupKey(completion: Completion, groupBys: string[]): string {
  return JSON.stringify(groupBys.map(qId => getAnswerValue(completion, qId)));
}

export function groupCompletions(completions: Completion[], groupBys: string[]): Map<string, Completion[]> {
  const groups = new Map<string, Completion[]>();
  for (const c of completions) {
    const key = getGroupKey(c, groupBys);
    const existing = groups.get(key);
    if (existing) existing.push(c);
    else groups.set(key, [c]);
  }
  return groups;
}

export function getGroupLabel(key: string, groupBys: string[], questions: Question[]): string {
  const values = JSON.parse(key) as Array<string | number | boolean | null>;
  return groupBys.map((qId, i) => {
    const q = questions.find(q => q.id === qId);
    if (!q) return String(values[i] ?? '—');
    const fakeAnswer: Answer = { questionId: qId, value: values[i] };
    return `${q.prompt}: ${getAnswerDisplay([fakeAnswer], q) || '—'}`;
  }).join(', ');
}

export function computeTotals(completions: Completion[], questions: Question[]): TotalsRow {
  const questionSums: Record<string, number | null> = {};
  for (const q of questions) {
    if (q.type === 'INTEGER' || q.type === 'MULTIPLIER') {
      questionSums[q.id] = completions.reduce((sum, c) => {
        const v = getAnswerValue(c, q.id);
        return sum + (typeof v === 'number' ? v : 0);
      }, 0);
    } else {
      questionSums[q.id] = null;
    }
  }
  return {
    count: completions.length,
    xpSum: completions.reduce((sum, c) => sum + c.xpEarned, 0),
    questionSums,
  };
}

export function addGroupBy(groupBys: string[], sorts: SortEntry[], questionId: string): { groupBys: string[]; sorts: SortEntry[] } {
  const newGroupBys = [...groupBys, questionId];
  const groupKeySet = new Set(newGroupBys.map(id => `question:${id}` as SortKey));
  const key = `question:${questionId}` as SortKey;
  const wasInExtra = sorts.some(s => s.key === key) && !groupBys.includes(questionId);
  const existingEntry = sorts.find(s => s.key === key);
  const extraSorts = sorts.filter(s => !groupKeySet.has(s.key));
  const orderedGroupSorts: SortEntry[] = newGroupBys
    .map(id => sorts.find(s => s.key === `question:${id}`))
    .filter((s): s is SortEntry => s !== undefined);
  if (!orderedGroupSorts.find(s => s.key === key)) {
    orderedGroupSorts.push(wasInExtra && existingEntry ? existingEntry : { key, dir: 'asc' });
  }
  return { groupBys: newGroupBys, sorts: [...orderedGroupSorts, ...extraSorts] };
}

export function removeGroupBy(groupBys: string[], sorts: SortEntry[], questionId: string): { groupBys: string[]; sorts: SortEntry[] } {
  const key = `question:${questionId}` as SortKey;
  return {
    groupBys: groupBys.filter(id => id !== questionId),
    sorts: sorts.filter(s => s.key !== key),
  };
}

export function clickColumnHeader(sorts: SortEntry[], key: SortKey, groupBys: string[]): SortEntry[] {
  const qId = questionIdFromKey(key);
  const isGrouped = qId !== null && groupBys.includes(qId);
  const existing = sorts.find(s => s.key === key);
  if (!existing) {
    if (isGrouped) {
      const groupKeySet = new Set(groupBys.map(id => `question:${id}` as SortKey));
      const groupSorts = sorts.filter(s => groupKeySet.has(s.key));
      const extraSorts = sorts.filter(s => !groupKeySet.has(s.key));
      return [...groupSorts, { key, dir: 'asc' }, ...extraSorts];
    }
    return [...sorts, { key, dir: 'asc' }];
  }
  if (existing.dir === 'asc') return sorts.map(s => s.key === key ? { ...s, dir: 'desc' as SortDir } : s);
  return sorts.filter(s => s.key !== key);
}

// --- Export data builders (exported for testing) ---

function chronological(completions: Completion[]): Completion[] {
  return [...completions].sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
}

export function buildCsvHeaders(questions: Question[]): string[] {
  const headers = ['completedAt', 'streak'];
  for (const q of questions) {
    headers.push(q.prompt);
    if (q.type === 'ENUM') headers.push(`${q.prompt} (index)`);
  }
  headers.push('xpEarned');
  return headers;
}

export function buildCsvRows(completions: Completion[], questions: Question[]): string[][] {
  return chronological(completions).map(c => {
    const row: string[] = [
      new Date(c.completedAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      String(c.streak),
    ];
    for (const q of questions) {
      row.push(getAnswerDisplay(c.answers, q));
      if (q.type === 'ENUM') {
        const ans = c.answers.find(a => a.questionId === q.id);
        const choice = (q as EnumQuestion).choices?.find(ch => ch.id === String(ans?.value));
        row.push(choice ? String(choice.order) : '');
      }
    }
    row.push(String(c.xpEarned));
    return row;
  });
}

export function buildJsonData(completions: Completion[], questions: Question[]): JsonCompletion[] {
  return chronological(completions).map(c => ({
    completedAt: c.completedAt,
    xpEarned: c.xpEarned,
    streak: c.streak,
    answers: questions.map(q => {
      const ans = c.answers.find(a => a.questionId === q.id);
      const value = getAnswerDisplay(c.answers, q);
      if (q.type === 'ENUM') {
        const choice = (q as EnumQuestion).choices?.find(ch => ch.id === String(ans?.value));
        return { prompt: q.prompt, value, enumIndex: choice?.order };
      }
      return { prompt: q.prompt, value };
    }),
  }));
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCsv(completions: Completion[], questions: Question[], choreTitle: string): void {
  const headers = buildCsvHeaders(questions);
  const rows = buildCsvRows(completions, questions);
  const csv = [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
  triggerDownload(csv, `${getDateString()}-completions-${slugify(choreTitle)}.csv`, 'text/csv');
}

export function exportJson(completions: Completion[], questions: Question[], choreTitle: string): void {
  const data = buildJsonData(completions, questions);
  triggerDownload(JSON.stringify(data, null, 2), `${getDateString()}-completions-${slugify(choreTitle)}.json`, 'application/json');
}
```

- [ ] **Step 4: Run tests — expect them to pass**

```
bun run test -- src/components/chores/completionsTable.test.ts
```
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/chores/completionsTable.ts src/components/chores/completionsTable.test.ts
git commit -m "feat: add pure completionsTable logic with sort, group, totals, export"
```

---

## Task 6: `CompletionsTable` — sorting UI

**Files:**
- Create: `src/components/chores/CompletionsTable.tsx` (initial version, flat table + sorting only)

- [ ] **Step 1: Create CompletionsTable with sorting**

```tsx
// src/components/chores/CompletionsTable.tsx
import { useState } from 'react';
import type { Completion, Question } from '@/types';
import { getAnswerDisplay } from '@/questions/display';
import { Button } from '@/components/ui/button';
import {
  type SortEntry, type SortKey, sortCompletions, clickColumnHeader,
} from './completionsTable';

interface Props {
  completions: Completion[];
  questions: Question[];
  choreTitle: string;
}

function SortLabel({ sorts, colKey }: { sorts: SortEntry[]; colKey: SortKey }) {
  const idx = sorts.findIndex(s => s.key === colKey);
  if (idx === -1) return <span className="ml-1 text-muted-foreground/40 text-xs">↕</span>;
  const entry = sorts[idx];
  const n = idx + 1;
  return (
    <span
      className="ml-1 text-xs"
      dangerouslySetInnerHTML={{ __html: `${entry.dir === 'asc' ? '&uarr;' : '&darr;'}<sup>${n}</sup>` }}
    />
  );
}

export default function CompletionsTable({ completions, questions, choreTitle }: Props) {
  const [sorts, setSorts] = useState<SortEntry[]>([]);
  const [groupBys] = useState<string[]>([]); // extended in Task 7

  function handleHeaderClick(key: SortKey) {
    setSorts(prev => clickColumnHeader(prev, key, groupBys));
  }

  const sorted = sortCompletions(completions, sorts, questions);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  const hasSorts = sorts.length > 0;

  return (
    <div>
      {/* Toolbar placeholder for groupBy + export (Tasks 7/8) */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th
                className="py-2 pr-4 font-medium text-foreground whitespace-nowrap cursor-pointer select-none"
                onClick={() => handleHeaderClick('completedAt')}
              >
                Completed at
                <SortLabel sorts={sorts} colKey="completedAt" />
              </th>
              {questions.map(q => (
                <th
                  key={q.id}
                  className="py-2 pr-4 font-medium text-foreground cursor-pointer select-none"
                  onClick={() => handleHeaderClick(`question:${q.id}`)}
                >
                  {q.prompt}
                  <SortLabel sorts={sorts} colKey={`question:${q.id}`} />
                </th>
              ))}
              <th
                className="py-2 font-medium text-foreground text-right cursor-pointer select-none"
                onClick={() => handleHeaderClick('xpEarned')}
              >
                XP earned
                <SortLabel sorts={sorts} colKey="xpEarned" />
              </th>
              {hasSorts && (
                <th className="py-2 pl-4 font-normal">
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                    onClick={() => setSorts([])}
                  >
                    Reset sorting
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map(c => (
              <tr key={c.id} className="border-b border-border hover:bg-muted">
                <th scope="row" className="py-2 pr-4 text-muted-foreground whitespace-nowrap font-normal">
                  {formatDate(c.completedAt)}
                </th>
                {questions.map(q => (
                  <td key={q.id} className="py-2 pr-4 text-muted-foreground">
                    {getAnswerDisplay(c.answers, q)}
                  </td>
                ))}
                <td className="py-2 text-foreground font-medium text-right">{c.xpEarned}</td>
                {hasSorts && <td />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```
bun run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/chores/CompletionsTable.tsx
git commit -m "feat: CompletionsTable with multi-column sort UI"
```

---

## Task 7: `CompletionsTable` — grouping UI + totals row

**Files:**
- Modify: `src/components/chores/CompletionsTable.tsx`

- [ ] **Step 1: Add grouping state and toolbar**

Add `import React, { useState } from 'react';` (replace the existing `import { useState }` line — `React` is needed for `React.Fragment` with keys).

Add to the imports from `./completionsTable`:

```tsx
import {
  type SortEntry, type SortKey, sortCompletions, clickColumnHeader,
  groupCompletions, getGroupLabel, computeTotals, addGroupBy, removeGroupBy,
} from './completionsTable';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
```

Change `const [groupBys] = useState<string[]>([]);` to:

```tsx
const [groupBys, setGroupBys] = useState<string[]>([]);
const [openGroup, setOpenGroup] = useState<string | null>(null);
```

- [ ] **Step 2: Add group-by toolbar above the table**

Replace `{/* Toolbar placeholder ... */}` with:

```tsx
{/* Toolbar */}
{(() => {
  const eligibleQuestions = questions.filter(q => q.type === 'ENUM' || q.type === 'INTEGER' || q.type === 'BOOLEAN');
  const availableToGroup = eligibleQuestions.filter(q => !groupBys.includes(q.id));
  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      {groupBys.map(qId => {
        const q = questions.find(q => q.id === qId);
        return (
          <span key={qId} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
            {q?.prompt ?? qId}
            <button
              className="hover:text-destructive"
              onClick={() => {
                const next = removeGroupBy(groupBys, sorts, qId);
                setGroupBys(next.groupBys);
                setSorts(next.sorts);
                setOpenGroup(null);
              }}
              aria-label={`Remove ${q?.prompt} group`}
            >×</button>
          </span>
        );
      })}
      {availableToGroup.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs h-6 px-2">+ Group by</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {availableToGroup.map(q => (
              <DropdownMenuItem key={q.id} onClick={() => {
                const next = addGroupBy(groupBys, sorts, q.id);
                setGroupBys(next.groupBys);
                setSorts(next.sorts);
                setOpenGroup(null);
              }}>
                {q.prompt}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
})()}
```

- [ ] **Step 3: Replace flat `<tbody>` with grouped accordion + grand totals**

Replace the entire `<tbody>` block and add a totals `<tfoot>`:

```tsx
<tbody>
  {groupBys.length === 0 ? (
    sorted.map(c => (
      <tr key={c.id} className="border-b border-border hover:bg-muted">
        <th scope="row" className="py-2 pr-4 text-muted-foreground whitespace-nowrap font-normal">{formatDate(c.completedAt)}</th>
        {questions.map(q => (
          <td key={q.id} className="py-2 pr-4 text-muted-foreground">{getAnswerDisplay(c.answers, q)}</td>
        ))}
        <td className="py-2 text-foreground font-medium text-right">{c.xpEarned}</td>
        {hasSorts && <td />}
      </tr>
    ))
  ) : (
    Array.from(groupCompletions(sorted, groupBys)).map(([key, groupRows]) => {
      const label = getGroupLabel(key, groupBys, questions);
      const subtotals = computeTotals(groupRows, questions);
      const isOpen = openGroup === key;
      return (
        <React.Fragment key={key}>
          <tr
            className="border-b border-border bg-muted/50 cursor-pointer select-none hover:bg-muted"
            onClick={() => setOpenGroup(isOpen ? null : key)}
          >
            <td colSpan={questions.length + 2 + (hasSorts ? 1 : 0)} className="py-2 px-2 font-medium">
              <span className="mr-2">{isOpen ? '▾' : '▸'}</span>
              {label}
              <span className="ml-3 text-xs font-normal text-muted-foreground">
                ({subtotals.count} completion{subtotals.count !== 1 ? 's' : ''} · {subtotals.xpSum} XP)
              </span>
            </td>
          </tr>
          {isOpen && groupRows.map(c => (
            <tr key={c.id} className="border-b border-border hover:bg-muted">
              <th scope="row" className="py-2 pr-4 text-muted-foreground whitespace-nowrap font-normal pl-6">{formatDate(c.completedAt)}</th>
              {questions.map(q => (
                <td key={q.id} className="py-2 pr-4 text-muted-foreground">{getAnswerDisplay(c.answers, q)}</td>
              ))}
              <td className="py-2 text-foreground font-medium text-right">{c.xpEarned}</td>
              {hasSorts && <td />}
            </tr>
          ))}
        </React.Fragment>
      );
    })
  )}
</tbody>
```

- [ ] **Step 4: Add totals `<tfoot>`**

After `</tbody>`, before `</table>`:

```tsx
{(() => {
  const totals = computeTotals(completions, questions);
  return (
    <tfoot>
      <tr className="border-t-2 border-border font-medium bg-muted/30">
        <th scope="row" className="py-2 pr-4 text-foreground whitespace-nowrap text-left">
          {totals.count} completion{totals.count !== 1 ? 's' : ''}
        </th>
        {questions.map(q => (
          <td key={q.id} className="py-2 pr-4 text-foreground">
            {totals.questionSums[q.id] !== null ? totals.questionSums[q.id] : '—'}
          </td>
        ))}
        <td className="py-2 text-foreground font-medium text-right">{totals.xpSum}</td>
        {hasSorts && <td />}
      </tr>
    </tfoot>
  );
})()}
```

- [ ] **Step 5: Typecheck**

```
bun run typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/chores/CompletionsTable.tsx
git commit -m "feat: CompletionsTable grouping accordion and totals row"
```

---

## Task 8: `CompletionsTable` — export button

**Files:**
- Modify: `src/components/chores/CompletionsTable.tsx`

- [ ] **Step 1: Add export imports**

Add to the imports from `./completionsTable`:

```tsx
import {
  ..., exportCsv, exportJson,
} from './completionsTable';
```

- [ ] **Step 2: Add Export button to toolbar**

At the right end of the toolbar `<div>`, after the `+ Group by` dropdown:

```tsx
<div className="ml-auto">
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" className="text-xs h-6 px-2">Export ▾</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => exportCsv(completions, questions, choreTitle)}>
        Export as CSV
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => exportJson(completions, questions, choreTitle)}>
        Export as JSON
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</div>
```

- [ ] **Step 3: Typecheck and commit**

```
bun run typecheck
git add src/components/chores/CompletionsTable.tsx
git commit -m "feat: CompletionsTable CSV/JSON export"
```

---

## Task 9: Wire `CompletionsTable` into `ChorePage` + component tests

**Files:**
- Modify: `src/components/chores/ChorePage.tsx`
- Create: `src/components/chores/CompletionsTable.test.tsx`

- [ ] **Step 1: Write CompletionsTable component tests**

```tsx
// src/components/chores/CompletionsTable.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CompletionsTable from './CompletionsTable';
import type { Completion, Question } from '@/types';

vi.mock('./completionsTable', async () => {
  const actual = await import('./completionsTable');
  return { ...actual, exportCsv: vi.fn(), exportJson: vi.fn() };
});

const mkCompletion = (id: string, xp: number): Completion => ({
  id, choreKey: 'k', completedAt: `2026-01-0${id}T00:00:00Z`, xpEarned: xp, streak: 1, answers: [],
});

const completions = [mkCompletion('1', 100), mkCompletion('2', 200)];
const questions: Question[] = [];

describe('CompletionsTable', () => {
  it('renders totals row always', () => {
    render(<CompletionsTable completions={completions} questions={questions} choreTitle="Test" />);
    expect(screen.getByText('2 completions')).toBeInTheDocument();
  });

  it('shows Reset sorting only when sorts are active', () => {
    render(<CompletionsTable completions={completions} questions={questions} choreTitle="Test" />);
    expect(screen.queryByText('Reset sorting')).toBeNull();
    fireEvent.click(screen.getByText('Completed at'));
    expect(screen.getByText('Reset sorting')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Reset sorting'));
    expect(screen.queryByText('Reset sorting')).toBeNull();
  });

  it('accordion opens on click (▸ → ▾) and closes when clicked again (▾ → ▸)', () => {
    const q: Question = {
      id: 'q1', choreKey: 'k', prompt: 'Mood', required: false, order: 1, type: 'ENUM',
      choices: [{ id: 'c1', label: 'Happy', order: 1 }],
    };
    const c = { ...mkCompletion('1', 100), answers: [{ questionId: 'q1', value: 'c1' }] };
    render(<CompletionsTable completions={[c]} questions={[q]} choreTitle="Test" />);
    fireEvent.click(screen.getByText('+ Group by'));
    fireEvent.click(screen.getByText('Mood'));
    const header = screen.getByText(/Mood: Happy/);
    expect(screen.getByText('▸')).toBeInTheDocument(); // closed
    fireEvent.click(header);
    expect(screen.getByText('▾')).toBeInTheDocument(); // open
    fireEvent.click(header);
    expect(screen.getByText('▸')).toBeInTheDocument(); // closed again
  });
});
```

- [ ] **Step 2: Run tests**

```
bun run test -- src/components/chores/CompletionsTable.test.tsx
```
Expected: PASS.

- [ ] **Step 3: Replace inline table in ChorePage with CompletionsTable**

In `ChorePage.tsx`, add the import:

```tsx
import CompletionsTable from '@/components/chores/CompletionsTable';
```

Replace the entire `{completions.length === 0 ? ... : <div className="overflow-x-auto">...</div>}` block with:

```tsx
{completions.length === 0 ? (
  <p className="text-sm text-muted-foreground italic">No completions yet.</p>
) : (
  <CompletionsTable completions={completions} questions={choreQuestions} choreTitle={chore.title} />
)}
```

Remove the now-unused `formatDate` function and `getAnswerDisplay` import from `ChorePage.tsx`.

- [ ] **Step 4: Typecheck and commit**

```
bun run typecheck
git add src/components/chores/ChorePage.tsx src/components/chores/CompletionsTable.test.tsx
git commit -m "feat: wire CompletionsTable into ChorePage"
```

---

## Task 10: E2E tests

**Files:**
- Add tests to the existing Playwright spec directory (run `find . -name "*.spec.ts" -not -path "*/node_modules/*"` to locate it)

- [ ] **Step 1: Locate existing Playwright spec directory**

```bash
find . -name "*.spec.ts" -not -path "*/node_modules/*" | head -5
```

- [ ] **Step 2: Add E2E tests for sorting, grouping, and export**

In the Playwright spec file for chore-related flows (or create `e2e/chore-details.spec.ts` if none exists):

```ts
import { test, expect } from '@playwright/test';

test.describe('CompletionsTable', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a chore with completions — adjust URL to an existing chore key in test data
    await page.goto('/chores/test-pack%2Ftest-chore');
  });

  test('sort badge appears on first click, disappears after Reset', async ({ page }) => {
    await page.getByRole('columnheader', { name: /XP earned/ }).click();
    await expect(page.locator('th', { hasText: 'XP earned' }).locator('sup')).toHaveText('1');
    await page.getByRole('button', { name: 'Reset sorting' }).click();
    await expect(page.locator('th', { hasText: 'XP earned' }).locator('sup')).not.toBeVisible();
  });

  test('second column click adds secondary sort badge', async ({ page }) => {
    await page.getByRole('columnheader', { name: /Completed at/ }).click();
    await page.getByRole('columnheader', { name: /XP earned/ }).click();
    await expect(page.locator('th', { hasText: 'XP earned' }).locator('sup')).toHaveText('2');
  });

  test('opening one accordion group closes another', async ({ page }) => {
    // Requires at least two distinct group values
    await page.getByRole('button', { name: '+ Group by' }).click();
    await page.getByRole('menuitem').first().click();
    const groups = page.locator('tr[data-group]');
    await groups.nth(0).click();
    await groups.nth(1).click();
    // First group should now be closed
    await expect(page.locator('tr[data-group-open="true"]')).toHaveCount(1);
  });

  test('Export as CSV triggers download', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export ▾' }).click();
    await page.getByRole('menuitem', { name: 'Export as CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^\d{4}-\d{2}-\d{2}-completions-.+\.csv$/);
  });
});
```

> **Note:** The accordion E2E test in step 2 requires `data-group` and `data-group-open` attributes on group header rows. Add `data-group={key} data-group-open={isOpen}` to the group header `<tr>` in `CompletionsTable.tsx`.

- [ ] **Step 3: Add data attributes to group header rows**

In `CompletionsTable.tsx`, update the group header `<tr>`:

```tsx
<tr
  key={`header-${key}`}
  data-group={key}
  data-group-open={isOpen}
  className="..."
  onClick={...}
>
```

- [ ] **Step 4: Run E2E tests**

```bash
XDG_CACHE_HOME=/tmp/pw-cache node node_modules/.bin/playwright test e2e/chore-details.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Final commit**

```bash
git add -p  # stage only the e2e spec and CompletionsTable data-attribute changes
git commit -m "test: E2E tests for CompletionsTable sort, group, export"
```
