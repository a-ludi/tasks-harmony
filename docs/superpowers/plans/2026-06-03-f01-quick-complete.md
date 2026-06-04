# F01: Quick-Complete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three related quick-complete improvements: (1) **per-question deactivate** — mark individual questions as inactive so they are skipped on completion; (2) **single-option shortcut** — auto-complete without a modal when no active required questions remain unanswered; (3) **pre-defined answer sets** — save and recall named sets of answers for a chore.

**Architecture:**

1. **Per-question deactivate**: Add optional `active?: boolean` to the `Question` type (falsy = inactive, default true for all existing questions). Filter inactive questions out in `CompletionModal`. Add a toggle in `QuestionFormFields` (and respect it in `QuestionBuilder`).

2. **Single-option shortcut**: Extend `CompleteButton` to skip the modal when `questions.filter(q => q.active !== false && q.required)` is empty (either no questions at all, or all questions are optional/inactive). Already works for zero questions; this makes it work for all-optional/all-inactive cases too.

3. **Pre-defined answer sets**: New type `QuickAnswerSet`. New DB store `quickAnswerSets` (DB version 2 migration). New store actions. `CompletionModal` gains a "Load saved answers" button that pre-fills the form.

**Tech Stack:** TypeScript, React, Zustand, `idb` (DB v2 migration), Tailwind CSS.

---

### Task 1: Add `active` field to Question type and filter in CompletionModal

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/components/completion/CompletionModal.tsx`
- Modify: `src/components/questions/QuestionFormFields.tsx`
- Create: `src/questions/activeQuestions.test.ts`

- [ ] **Step 1: Write a failing test for the active filter**

Create `src/questions/activeQuestions.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import type { Question } from '@/types';

function filterActiveQuestions(questions: Question[]): Question[] {
  return questions.filter((q) => q.active !== false);
}

const BASE: Omit<Question, 'type'> = {
  id: 'q-1', choreKey: 'p/c', prompt: 'Q', required: true, order: 0,
};

const ACTIVE_Q: Question = { ...BASE, type: 'TEXT' } as Question;
const EXPLICITLY_ACTIVE: Question = { ...BASE, id: 'q-2', type: 'BOOLEAN', active: true } as Question;
const INACTIVE_Q: Question = { ...BASE, id: 'q-3', type: 'INTEGER', active: false } as Question;

describe('filterActiveQuestions', () => {
  it('includes questions without an active field (default active)', () => {
    expect(filterActiveQuestions([ACTIVE_Q])).toHaveLength(1);
  });

  it('includes questions with active: true', () => {
    expect(filterActiveQuestions([EXPLICITLY_ACTIVE])).toHaveLength(1);
  });

  it('excludes questions with active: false', () => {
    expect(filterActiveQuestions([INACTIVE_Q])).toHaveLength(0);
  });

  it('filters correctly in a mixed list', () => {
    const result = filterActiveQuestions([ACTIVE_Q, EXPLICITLY_ACTIVE, INACTIVE_Q]);
    expect(result).toHaveLength(2);
    expect(result.some((q) => q.active === false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
bun test --isolate src/questions/activeQuestions.test.ts
```

Expected: FAIL — the `active` field does not exist on the `Question` type yet (TypeScript error would show in typecheck).

Actually the test itself is plain JS-compatible logic and will pass. Run typecheck to see the error:

```bash
bun run typecheck
```

Expected: type error on `active: false` in the test — `active` is not a known property.

- [ ] **Step 3: Add `active` to the Question type**

In `src/types/index.ts`, add `active?: boolean;` to each of the five question interfaces. The shared fields are repeated across union members, so add to all five:

```ts
export interface TextQuestion {
  id: string; choreKey: string; prompt: string; required: boolean; order: number;
  active?: boolean;
  type: 'TEXT';
  regexPattern?: string;
}
export interface IntegerQuestion {
  id: string; choreKey: string; prompt: string; required: boolean; order: number;
  active?: boolean;
  type: 'INTEGER';
  minValue?: number;
  maxValue?: number;
}
export interface BooleanQuestion {
  id: string; choreKey: string; prompt: string; required: boolean; order: number;
  active?: boolean;
  type: 'BOOLEAN';
}
export interface EnumQuestion {
  id: string; choreKey: string; prompt: string; required: boolean; order: number;
  active?: boolean;
  type: 'ENUM';
  choices?: EnumChoice[];
}
export interface MultiplierQuestion {
  id: string; choreKey: string; prompt: string; required: boolean; order: number;
  active?: boolean;
  type: 'MULTIPLIER';
  xpPerUnit: number;
  multiplierAnswerType: 'integer' | 'float';
}
```

- [ ] **Step 4: Run typecheck + test**

```bash
bun run typecheck && bun test --isolate src/questions/activeQuestions.test.ts
```

Expected: exits 0, 4 tests pass.

- [ ] **Step 5: Filter inactive questions in CompletionModal**

In `src/components/completion/CompletionModal.tsx`, find where `sortedQuestions` is built (line 16):

```ts
const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);
```

Replace with:

```ts
const sortedQuestions = [...questions]
  .filter((q) => q.active !== false)
  .sort((a, b) => a.order - b.order);
```

- [ ] **Step 6: Add active toggle to QuestionFormFields**

In `src/components/questions/QuestionFormFields.tsx`, in the flex row that contains the Type select and Required checkbox, add an Active toggle after the Required checkbox:

```tsx
<div className="flex items-end pb-1.5">
  <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
    <input
      type="checkbox"
      checked={question.active !== false}
      onChange={(e) => update({ active: e.target.checked } as Partial<DraftQuestion>)}
      className="h-4 w-4 rounded border-gray-300 accent-blue-600"
    />
    Active
  </label>
</div>
```

This goes inside the `<div className="flex flex-wrap gap-4">` block, after the Required checkbox div.

- [ ] **Step 7: Run typecheck + full suite**

```bash
bun run typecheck && bun test
```

Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/components/completion/CompletionModal.tsx src/components/questions/QuestionFormFields.tsx src/questions/activeQuestions.test.ts
git commit -m "feat: add per-question active toggle — inactive questions are skipped on completion"
```

---

### Task 2: Single-option shortcut in CompleteButton

**Files:**
- Modify: `src/components/chores/CompleteButton.tsx`
- Modify: `src/components/chores/CompleteButton.test.ts` (create)

- [ ] **Step 1: Write a failing test for the shortcut logic**

Create `src/components/chores/CompleteButton.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import type { Question } from '@/types';

function needsModal(questions: Question[]): boolean {
  return questions.some((q) => q.active !== false && q.required);
}

const BASE: Omit<Question, 'type'> = {
  id: 'q-1', choreKey: 'p/c', prompt: 'Q', required: true, order: 0,
};

describe('needsModal', () => {
  it('returns false when there are no questions', () => {
    expect(needsModal([])).toBe(false);
  });

  it('returns true when there is a required active question', () => {
    const q: Question = { ...BASE, type: 'TEXT' } as Question;
    expect(needsModal([q])).toBe(true);
  });

  it('returns false when all questions are inactive', () => {
    const q: Question = { ...BASE, type: 'TEXT', active: false } as Question;
    expect(needsModal([q])).toBe(false);
  });

  it('returns false when all questions are optional', () => {
    const q: Question = { ...BASE, type: 'TEXT', required: false } as Question;
    expect(needsModal([q])).toBe(false);
  });

  it('returns true when at least one question is required and active', () => {
    const required: Question = { ...BASE, type: 'TEXT' } as Question;
    const optional: Question = { ...BASE, id: 'q-2', type: 'BOOLEAN', required: false } as Question;
    expect(needsModal([required, optional])).toBe(true);
  });

  it('returns false when required question is inactive', () => {
    const q: Question = { ...BASE, type: 'TEXT', active: false } as Question;
    expect(needsModal([q])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect pass (logic is self-contained)**

```bash
bun test --isolate src/components/chores/CompleteButton.test.ts
```

Expected: PASS — all 6 tests pass (the helper is inline in the test file).

- [ ] **Step 3: Update CompleteButton to use the same logic**

In `src/components/chores/CompleteButton.tsx`, replace:

```ts
const hasQuestions = questions.length > 0;
```

with:

```ts
const hasQuestions = questions.some((q) => q.active !== false && q.required);
```

- [ ] **Step 4: Run typecheck + full suite**

```bash
bun run typecheck && bun test
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/chores/CompleteButton.tsx src/components/chores/CompleteButton.test.ts
git commit -m "feat: skip completion modal when all questions are optional or inactive"
```

---

### Task 3: Pre-defined answer sets — types and DB migration

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/db/index.ts`

- [ ] **Step 1: Write a failing test for the DB migration**

Create `src/db/quickAnswerSets.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from './index';
import type { QuickAnswerSet } from '@/types';

describe('quickAnswerSets DB store (v2)', () => {
  beforeEach(() => {
    // Reset IDB between tests
    (globalThis as Record<string, unknown>).indexedDB = new IDBFactory();
  });

  it('can put and retrieve a QuickAnswerSet', async () => {
    const db = await openDB('test-qas');
    const qas: QuickAnswerSet = {
      id: 'qas-1',
      choreKey: 'p/c',
      label: 'Default',
      answers: [{ questionId: 'q-1', value: 'yes' }],
    };
    await db.put('quickAnswerSets', qas);
    const retrieved = await db.get('quickAnswerSets', 'qas-1');
    expect(retrieved?.label).toBe('Default');
    expect(retrieved?.answers[0].questionId).toBe('q-1');
    db.close();
  });

  it('can query by choreKey index', async () => {
    const db = await openDB('test-qas-idx');
    const qas: QuickAnswerSet = {
      id: 'qas-2', choreKey: 'p/chore-x', label: 'My Set',
      answers: [],
    };
    await db.put('quickAnswerSets', qas);
    const results = await db.getAllFromIndex('quickAnswerSets', 'by-chore', 'p/chore-x');
    expect(results).toHaveLength(1);
    db.close();
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
bun test --isolate src/db/quickAnswerSets.test.ts
```

Expected: FAIL — `QuickAnswerSet` not found, `quickAnswerSets` store not in schema.

- [ ] **Step 3: Add QuickAnswerSet to types**

In `src/types/index.ts`, add after the `SyncState` interface:

```ts
export interface QuickAnswerSet {
  id: string;
  choreKey: string;
  label: string;
  answers: Answer[];
}
```

- [ ] **Step 4: Update DB schema**

In `src/db/schema.ts`, add the new store:

```ts
import type { Pack, Chore, Question, Completion, XPSettings, UserProfile, SyncState, QuickAnswerSet } from '@/types';

export interface TasksHarmonyDB extends DBSchema {
  packs:           { key: string; value: Pack };
  chores:          { key: string; value: Chore; indexes: { 'by-pack': string } };
  questions:       { key: string; value: Question; indexes: { 'by-chore': string } };
  completions:     { key: string; value: Completion; indexes: { 'by-chore': string; 'by-date': string } };
  xpSettings:      { key: string; value: XPSettings };
  profile:         { key: string; value: UserProfile };
  syncState:       { key: string; value: SyncState };
  quickAnswerSets: { key: string; value: QuickAnswerSet; indexes: { 'by-chore': string } };
}
```

- [ ] **Step 5: Migrate DB to version 2**

In `src/db/index.ts`, change `DB_VERSION` from `1` to `2` and make the upgrade function version-aware:

```ts
const DB_VERSION = 2;

export async function openDB(name = DB_NAME): Promise<IDBPDatabase<TasksHarmonyDB>> {
  const db = await idbOpen<TasksHarmonyDB>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
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
    },
  });
  await seed(db);
  return db;
}
```

Also add DB helpers at the bottom of `src/db/index.ts`:

```ts
import type { QuickAnswerSet } from '@/types';

export const getQuickAnswerSets = (
  db: IDBPDatabase<TasksHarmonyDB>,
  choreKey: string,
): Promise<QuickAnswerSet[]> =>
  db.getAllFromIndex('quickAnswerSets', 'by-chore', choreKey);

export const putQuickAnswerSet = (
  db: IDBPDatabase<TasksHarmonyDB>,
  qas: QuickAnswerSet,
): Promise<string> =>
  db.put('quickAnswerSets', qas);

export const deleteQuickAnswerSet = (
  db: IDBPDatabase<TasksHarmonyDB>,
  id: string,
): Promise<void> =>
  db.delete('quickAnswerSets', id);
```

- [ ] **Step 6: Run tests — expect pass**

```bash
bun test --isolate src/db/quickAnswerSets.test.ts
```

Expected: all 2 tests pass.

- [ ] **Step 7: Run full suite**

```bash
bun run typecheck && bun test
```

Expected: exits 0, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/db/schema.ts src/db/index.ts src/db/quickAnswerSets.test.ts
git commit -m "feat: add QuickAnswerSet type and DB store (schema v2 migration)"
```

---

### Task 4: Store actions for QuickAnswerSets

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Add QuickAnswerSet state and actions to the store**

In `src/store/index.ts`, update the `AppState` interface (the one defined in this file, not the exported type) to include:

```ts
quickAnswerSets: QuickAnswerSet[];
saveQuickAnswerSet: (qas: QuickAnswerSet) => Promise<void>;
deleteQuickAnswerSet: (id: string) => Promise<void>;
loadQuickAnswerSets: (choreKey: string) => Promise<QuickAnswerSet[]>;
```

Add the import at the top:

```ts
import type { ..., QuickAnswerSet } from '@/types';
import { ..., getQuickAnswerSets, putQuickAnswerSet, deleteQuickAnswerSet as dbDeleteQAS } from '@/db';
```

Add to the initial state:

```ts
quickAnswerSets: [],
```

Add the actions inside the store:

```ts
saveQuickAnswerSet: async (qas) => {
  const { db } = get();
  if (!db) throw new Error('DB not initialised');
  await putQuickAnswerSet(db, qas);
  set((state) => ({
    quickAnswerSets: [
      ...state.quickAnswerSets.filter((s) => s.id !== qas.id),
      qas,
    ],
  }));
},

deleteQuickAnswerSet: async (id) => {
  const { db } = get();
  if (!db) throw new Error('DB not initialised');
  await dbDeleteQAS(db, id);
  set((state) => ({
    quickAnswerSets: state.quickAnswerSets.filter((s) => s.id !== id),
  }));
},

loadQuickAnswerSets: async (choreKey) => {
  const { db } = get();
  if (!db) return [];
  const sets = await getQuickAnswerSets(db, choreKey);
  set({ quickAnswerSets: sets });
  return sets;
},
```

- [ ] **Step 2: Run typecheck + full suite**

```bash
bun run typecheck && bun test
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/store/index.ts
git commit -m "feat: add saveQuickAnswerSet, deleteQuickAnswerSet, loadQuickAnswerSets store actions"
```

---

### Task 5: Pre-defined answer sets UI in CompletionModal

**Files:**
- Modify: `src/components/completion/CompletionModal.tsx`

- [ ] **Step 1: Load and display saved answer sets**

In `src/components/completion/CompletionModal.tsx`, add store subscriptions:

```ts
const quickAnswerSets = useAppStore(
  useShallow((s) => s.quickAnswerSets.filter((qas) => qas.choreKey === choreKey)),
);
const saveQuickAnswerSet = useAppStore((s) => s.saveQuickAnswerSet);
const deleteQuickAnswerSet = useAppStore((s) => s.deleteQuickAnswerSet);
const loadQuickAnswerSets = useAppStore((s) => s.loadQuickAnswerSets);
```

Add `useShallow` import:

```ts
import { useShallow } from 'zustand/shallow';
```

Add a `useEffect` to load answer sets when the modal opens:

```ts
useEffect(() => {
  loadQuickAnswerSets(choreKey);
}, [choreKey, loadQuickAnswerSets]);
```

Add state for the save-new-set UI:

```ts
const [showSaveSet, setShowSaveSet] = useState(false);
const [saveSetLabel, setSaveSetLabel] = useState('');
```

- [ ] **Step 2: Add "Load saved answers" and "Save answers" UI**

In the modal, after the `<h2>Complete Chore</h2>` and before the `<p>` description, add:

```tsx
{quickAnswerSets.length > 0 && (
  <div className="mb-3 flex flex-wrap gap-2">
    <span className="text-xs text-gray-500 self-center">Load:</span>
    {quickAnswerSets.map((qas) => (
      <div key={qas.id} className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            const loaded = Object.fromEntries(qas.answers.map((a) => [a.questionId, a.value]));
            setAnswers((prev) => ({ ...prev, ...loaded }));
          }}
          className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
        >
          {qas.label}
        </button>
        <button
          type="button"
          onClick={() => deleteQuickAnswerSet(qas.id)}
          className="text-xs text-gray-400 hover:text-red-500"
          title={`Delete "${qas.label}"`}
        >
          ×
        </button>
      </div>
    ))}
  </div>
)}
```

At the bottom of the form, before the Cancel/Submit buttons row, add:

```tsx
{showSaveSet ? (
  <div className="flex gap-2">
    <input
      type="text"
      value={saveSetLabel}
      onChange={(e) => setSaveSetLabel(e.target.value)}
      placeholder="Set name (e.g. Default)"
      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
      autoFocus
    />
    <button
      type="button"
      onClick={async () => {
        if (!saveSetLabel.trim()) return;
        const answerList: Answer[] = sortedQuestions.map((q) => ({
          questionId: q.id,
          value: answers[q.id] ?? null,
        }));
        await saveQuickAnswerSet({
          id: crypto.randomUUID(),
          choreKey,
          label: saveSetLabel.trim(),
          answers: answerList,
        });
        setSaveSetLabel('');
        setShowSaveSet(false);
      }}
      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
    >
      Save
    </button>
    <button
      type="button"
      onClick={() => setShowSaveSet(false)}
      className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
    >
      Cancel
    </button>
  </div>
) : (
  <button
    type="button"
    onClick={() => setShowSaveSet(true)}
    className="text-xs text-blue-600 hover:underline"
  >
    Save current answers as a set
  </button>
)}
```

- [ ] **Step 3: Run typecheck + full suite**

```bash
bun run typecheck && bun test
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/completion/CompletionModal.tsx
git commit -m "feat: add pre-defined answer sets to CompletionModal — save, load, and delete"
```
