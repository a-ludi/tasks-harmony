# Chore Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement moving chores between packs (via the edit modal), safe pack deletion (per-chore dialog with delete/move dispositions, completions preserved via UUID choreKey rewrite), and chore duplication (lightweight dialog on every chore card).

**Architecture:** New `resolveChoreIdCollision` utility handles numeric-suffix collision resolution. Three new store actions (`moveChore`, `duplicateChore`, reworked `deletePack`) use atomic IndexedDB transactions for key rewrites. Two new dialog components (`PackDeletionDialog`, `DuplicateChoreDialog`) and targeted edits to `ChoreFormModal`, `PackDashboard`, and `ChoreCard` wire everything together.

**Tech Stack:** TypeScript, React, Zustand, idb (IndexedDB), bun test, fake-indexeddb

---

## File Map

| Action | File |
|---|---|
| Create | `src/chores/resolveCollision.ts` |
| Create | `src/chores/resolveCollision.test.ts` |
| Modify | `src/types/index.ts` — add `ChoreDisposition` |
| Modify | `src/store/index.ts` — add `moveChore`, `duplicateChore`; rework `deletePack` |
| Modify | `src/store/packActions.test.ts` — update `deletePack` test for new behavior |
| Create | `src/store/choreActions.test.ts` — tests for `moveChore`, `duplicateChore` |
| Modify | `src/components/chores/ChoreFormModal.tsx` — pack selector in edit mode |
| Create | `src/components/packs/PackDeletionDialog.tsx` |
| Modify | `src/components/packs/PackDashboard.tsx` — wire `PackDeletionDialog` |
| Create | `src/components/chores/DuplicateChoreDialog.tsx` |
| Modify | `src/components/dashboard/ChoreCard.tsx` — add Duplicate button |

---

## Task 1: `resolveChoreIdCollision` utility

**Files:**
- Create: `src/chores/resolveCollision.ts`
- Create: `src/chores/resolveCollision.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/chores/resolveCollision.test.ts
import { describe, expect, test } from 'bun:test';
import { resolveChoreIdCollision } from './resolveCollision';

describe('resolveChoreIdCollision', () => {
  test('returns original when no collision', () => {
    expect(resolveChoreIdCollision('make-bed', 'Make Bed', new Set())).toEqual({
      choreId: 'make-bed',
      title: 'Make Bed',
    });
  });

  test('appends -2 suffix on first collision', () => {
    expect(
      resolveChoreIdCollision('make-bed', 'Make Bed', new Set(['make-bed']))
    ).toEqual({ choreId: 'make-bed-2', title: 'Make Bed 2' });
  });

  test('skips taken suffixes and picks next free one', () => {
    expect(
      resolveChoreIdCollision(
        'make-bed', 'Make Bed',
        new Set(['make-bed', 'make-bed-2', 'make-bed-3'])
      )
    ).toEqual({ choreId: 'make-bed-4', title: 'Make Bed 4' });
  });

  test('appends fresh suffix without parsing existing suffix', () => {
    expect(
      resolveChoreIdCollision('make-bed-2', 'Make Bed 2', new Set(['make-bed-2']))
    ).toEqual({ choreId: 'make-bed-2-2', title: 'Make Bed 2 2' });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun test src/chores/resolveCollision.test.ts
```

Expected: `Cannot find module './resolveCollision'`

- [ ] **Step 3: Implement**

```typescript
// src/chores/resolveCollision.ts

export function resolveChoreIdCollision(
  baseChoreId: string,
  baseTitle: string,
  existingChoreIds: Set<string>,
): { choreId: string; title: string } {
  if (!existingChoreIds.has(baseChoreId)) {
    return { choreId: baseChoreId, title: baseTitle };
  }
  let n = 2;
  while (existingChoreIds.has(`${baseChoreId}-${n}`)) n++;
  return { choreId: `${baseChoreId}-${n}`, title: `${baseTitle} ${n}` };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
bun test src/chores/resolveCollision.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/chores/resolveCollision.ts src/chores/resolveCollision.test.ts
git commit -m "feat: add resolveChoreIdCollision utility"
```

---

## Task 2: Add `ChoreDisposition` type and `moveChore` store action

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/index.ts`
- Create: `src/store/choreActions.test.ts`

- [ ] **Step 1: Add `ChoreDisposition` to `src/types/index.ts`**

Append to the end of `src/types/index.ts`:

```typescript
export interface ChoreDisposition {
  choreKey: string;
  action: 'delete' | 'move';
  targetPackId?: string;
  resolvedChoreId?: string;
  resolvedTitle?: string;
}
```

- [ ] **Step 2: Write the failing tests for `moveChore`**

```typescript
// src/store/choreActions.test.ts
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, test } from 'bun:test';
import { useAppStore } from './index';

describe('moveChore', () => {
  beforeAll(async () => {
    await useAppStore.getState().init();
  });

  test('moves chore to target pack, updates key and packId', async () => {
    const packId = await useAppStore.getState().addPack('Move Target');
    const choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Move Me',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    const success = await useAppStore.getState().moveChore(choreKey, packId);

    expect(success).toBe(true);
    const state = useAppStore.getState();
    expect(state.chores.find((c) => c.key === choreKey)).toBeUndefined();
    const moved = state.chores.find((c) => c.choreId === 'move-me' && c.packId === packId);
    expect(moved).toBeDefined();
    expect(moved?.key).toBe(`${packId}/move-me`);
  });

  test('returns false and writes nothing when target pack has same choreId', async () => {
    const packId = await useAppStore.getState().addPack('Collision Target');
    await useAppStore.getState().addChore({
      packId,
      title: 'Clash Chore',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });
    const sourceKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Clash Chore',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    const success = await useAppStore.getState().moveChore(sourceKey, packId);

    expect(success).toBe(false);
    expect(useAppStore.getState().chores.find((c) => c.key === sourceKey)).toBeDefined();
  });

  test('cascades updated choreKey to all questions', async () => {
    const packId = await useAppStore.getState().addPack('Questions Target');
    const choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Chore With Questions',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });
    await useAppStore.getState().saveQuestions(choreKey, [{
      id: crypto.randomUUID(), choreKey, prompt: 'Q?', type: 'TEXT',
      required: false, order: 0, _isNew: true,
    } as import('@/components/questions/QuestionFormFields').DraftQuestion]);

    await useAppStore.getState().moveChore(choreKey, packId);

    const newKey = `${packId}/chore-with-questions`;
    const state = useAppStore.getState();
    expect(state.questions.filter((q) => q.choreKey === choreKey)).toHaveLength(0);
    expect(state.questions.filter((q) => q.choreKey === newKey)).toHaveLength(1);
  });

  test('cascades updated choreKey to all completions', async () => {
    const packId = await useAppStore.getState().addPack('Completions Target');
    const choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Chore With Completions',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });
    await useAppStore.getState().recordCompletion(choreKey, []);

    await useAppStore.getState().moveChore(choreKey, packId);

    const newKey = `${packId}/chore-with-completions`;
    const state = useAppStore.getState();
    expect(state.completions.filter((c) => c.choreKey === choreKey)).toHaveLength(0);
    expect(state.completions.filter((c) => c.choreKey === newKey)).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
bun test src/store/choreActions.test.ts
```

Expected: `useAppStore.getState().moveChore is not a function`

- [ ] **Step 4: Add `moveChore` to the `AppState` interface in `src/store/index.ts`**

In the `AppState` interface, add after `deletePack`:

```typescript
moveChore: (choreKey: string, targetPackId: string) => Promise<boolean>;
```

- [ ] **Step 5: Implement `moveChore` in the store**

Add inside `create<AppState>((set, get) => ({ ... }))`, after the `deletePack` implementation:

```typescript
moveChore: async (choreKey, targetPackId) => {
  const { db, chores, questions, completions } = get();
  if (!db) throw new Error('DB not initialised');

  const chore = chores.find((c) => c.key === choreKey);
  if (!chore) throw new Error(`Chore not found: ${choreKey}`);

  const newKey = `${targetPackId}/${chore.choreId}`;
  if (chores.some((c) => c.key === newKey)) return false;

  const choreQuestions = questions.filter((q) => q.choreKey === choreKey);
  const choreCompletions = completions.filter((c) => c.choreKey === choreKey);
  const newChore: Chore = { ...chore, key: newKey, packId: targetPackId };

  const tx = db.transaction(['chores', 'questions', 'completions'], 'readwrite');
  await tx.objectStore('chores').delete(choreKey);
  await tx.objectStore('chores').put(newChore);
  for (const q of choreQuestions) {
    await tx.objectStore('questions').put({ ...q, choreKey: newKey });
  }
  for (const c of choreCompletions) {
    await tx.objectStore('completions').put({ ...c, choreKey: newKey });
  }
  await tx.done;

  set((state) => ({
    chores: state.chores.map((c) => (c.key === choreKey ? newChore : c)),
    questions: state.questions.map((q) =>
      q.choreKey === choreKey ? { ...q, choreKey: newKey } : q,
    ),
    completions: state.completions.map((c) =>
      c.choreKey === choreKey ? { ...c, choreKey: newKey } : c,
    ),
  }));

  return true;
},
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
bun test src/store/choreActions.test.ts
```

Expected: 4 passing.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/store/index.ts src/store/choreActions.test.ts
git commit -m "feat: add moveChore store action with atomic key cascade"
```

---

## Task 3: Rework `deletePack` — preserve completions with UUID choreKey

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/store/packActions.test.ts`

- [ ] **Step 1: Update the existing `deletePack` test to match new behaviour**

In `src/store/packActions.test.ts`, replace the `'removes the pack and all its chores, questions, and completions'` test with:

```typescript
it('removes the pack, chores, and questions; rewrites completion choreKey to a UUID', async () => {
  const packId = await useAppStore.getState().addPack('Pack To Delete New');
  const choreKey = await useAppStore.getState().addChore({
    packId,
    title: 'Chore In Pack New',
    xpSize: 'S',
    recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
    repeatable: false,
    active: true,
  });

  await useAppStore.getState().saveQuestions(choreKey, [{
    id: crypto.randomUUID(),
    choreKey,
    prompt: 'Test?',
    type: 'TEXT',
    required: false,
    order: 0,
    _isNew: true,
  } as import('@/components/questions/QuestionFormFields').DraftQuestion]);

  await useAppStore.getState().recordCompletion(choreKey, []);
  const completionBefore = useAppStore.getState().completions.find((c) => c.choreKey === choreKey)!;

  await useAppStore.getState().deletePack(packId, [
    { choreKey, action: 'delete' },
  ]);

  const state = useAppStore.getState();
  expect(state.packs.find((p) => p.id === packId)).toBeUndefined();
  expect(state.chores.find((c) => c.packId === packId)).toBeUndefined();
  expect(state.questions.find((q) => q.choreKey === choreKey)).toBeUndefined();

  const completionAfter = state.completions.find((c) => c.id === completionBefore.id);
  expect(completionAfter).toBeDefined();
  expect(completionAfter?.choreKey).not.toBe(choreKey);
  expect(completionAfter?.choreKey).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
});

it('moves chore to target pack when disposition is move', async () => {
  const sourcePackId = await useAppStore.getState().addPack('Source Pack');
  const targetPackId = await useAppStore.getState().addPack('Target Pack For Delete');
  const choreKey = await useAppStore.getState().addChore({
    packId: sourcePackId,
    title: 'Chore To Move',
    xpSize: 'S',
    recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
    repeatable: false,
    active: true,
  });

  await useAppStore.getState().deletePack(sourcePackId, [
    {
      choreKey,
      action: 'move',
      targetPackId,
      resolvedChoreId: 'chore-to-move',
      resolvedTitle: 'Chore To Move',
    },
  ]);

  const state = useAppStore.getState();
  expect(state.packs.find((p) => p.id === sourcePackId)).toBeUndefined();
  expect(state.chores.find((c) => c.key === choreKey)).toBeUndefined();
  const moved = state.chores.find((c) => c.key === `${targetPackId}/chore-to-move`);
  expect(moved).toBeDefined();
  expect(moved?.packId).toBe(targetPackId);
});

it('deletes empty pack immediately with no dispositions', async () => {
  const packId = await useAppStore.getState().addPack('Empty Pack');
  await useAppStore.getState().deletePack(packId);
  expect(useAppStore.getState().packs.find((p) => p.id === packId)).toBeUndefined();
});
```

Also keep the `'throws when attempting to delete the personal pack'` test unchanged.

- [ ] **Step 2: Run tests to confirm the updated tests fail**

```bash
bun test src/store/packActions.test.ts
```

Expected: the three updated/new tests fail (old `deletePack` signature/behaviour mismatch).

- [ ] **Step 3: Add imports to `src/store/index.ts`**

At the top of `src/store/index.ts`, add the import:

```typescript
import { resolveChoreIdCollision } from '@/chores/resolveCollision';
import type { ChoreDisposition } from '@/types';
```

- [ ] **Step 4: Update the `AppState` interface for `deletePack`**

Replace:
```typescript
deletePack: (packId: string) => Promise<void>;
```
With:
```typescript
deletePack: (packId: string, dispositions?: ChoreDisposition[]) => Promise<void>;
```

- [ ] **Step 5: Replace the `deletePack` implementation**

Replace the entire existing `deletePack` implementation with:

```typescript
deletePack: async (packId, dispositions = []) => {
  const { db } = get();
  if (!db) throw new Error('DB not initialised');

  const pack = get().packs.find((p) => p.id === packId);
  if (!pack) throw new Error(`Pack '${packId}' not found`);
  if (pack.isPersonal) throw new Error('Cannot delete the personal pack');

  for (const d of dispositions) {
    if (d.action === 'delete') {
      const uuid = crypto.randomUUID();
      const choreCompletions = await getCompletionsByChore(db, d.choreKey);
      const choreQuestions = await getQuestions(db, d.choreKey);
      const tx = db.transaction(['chores', 'questions', 'completions'], 'readwrite');
      for (const c of choreCompletions) {
        await tx.objectStore('completions').put({ ...c, choreKey: uuid });
      }
      for (const q of choreQuestions) {
        await tx.objectStore('questions').delete(q.id);
      }
      await tx.objectStore('chores').delete(d.choreKey);
      await tx.done;
    } else if (d.action === 'move' && d.targetPackId && d.resolvedChoreId) {
      const chore = get().chores.find((c) => c.key === d.choreKey);
      if (!chore) continue;
      const newKey = `${d.targetPackId}/${d.resolvedChoreId}`;
      const choreQuestions = await getQuestions(db, d.choreKey);
      const choreCompletions = await getCompletionsByChore(db, d.choreKey);
      const newChore: Chore = {
        ...chore,
        key: newKey,
        choreId: d.resolvedChoreId,
        title: d.resolvedTitle ?? chore.title,
        packId: d.targetPackId,
      };
      const tx = db.transaction(['chores', 'questions', 'completions'], 'readwrite');
      await tx.objectStore('chores').delete(d.choreKey);
      await tx.objectStore('chores').put(newChore);
      for (const q of choreQuestions) {
        await tx.objectStore('questions').put({ ...q, choreKey: newKey });
      }
      for (const c of choreCompletions) {
        await tx.objectStore('completions').put({ ...c, choreKey: newKey });
      }
      await tx.done;
    }
  }

  await dbDeletePack(db, packId);

  const [updatedPacks, updatedChores, updatedQuestions, updatedCompletions] = await Promise.all([
    getPacks(db), getAllChores(db), getAllQuestions(db), getAllCompletions(db),
  ]);
  set({
    packs: updatedPacks,
    chores: updatedChores,
    questions: updatedQuestions,
    completions: updatedCompletions,
  });
},
```

- [ ] **Step 6: Run all tests**

```bash
bun test src/store/packActions.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/store/index.ts src/store/packActions.test.ts
git commit -m "feat: rework deletePack to preserve completions via UUID choreKey rewrite"
```

---

## Task 4: Add `duplicateChore` store action

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/store/choreActions.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/store/choreActions.test.ts`:

```typescript
describe('duplicateChore', () => {
  beforeAll(async () => {
    await useAppStore.getState().init();
  });

  test('creates a copy with empty completion history and returns new key', async () => {
    const choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Original Chore',
      xpSize: 'M',
      recurrence: { frequency: 'weekly', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: true,
      active: true,
    });
    await useAppStore.getState().recordCompletion(choreKey, []);

    const newKey = await useAppStore.getState().duplicateChore(choreKey, 'Original Chore (copy)', 'personal');

    const state = useAppStore.getState();
    const dupe = state.chores.find((c) => c.key === newKey);
    expect(dupe).toBeDefined();
    expect(dupe?.title).toBe('Original Chore (copy)');
    expect(dupe?.xpSize).toBe('M');
    expect(dupe?.repeatable).toBe(true);
    expect(state.completions.filter((c) => c.choreKey === newKey)).toHaveLength(0);
  });

  test('copies questions to the duplicate', async () => {
    const choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Chore With Q',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });
    await useAppStore.getState().saveQuestions(choreKey, [{
      id: crypto.randomUUID(), choreKey, prompt: 'Rate it?', type: 'INTEGER',
      required: true, order: 0, _isNew: true,
    } as import('@/components/questions/QuestionFormFields').DraftQuestion]);

    const newKey = await useAppStore.getState().duplicateChore(choreKey, 'Chore With Q (copy)', 'personal');

    const state = useAppStore.getState();
    const dupeQuestions = state.questions.filter((q) => q.choreKey === newKey);
    expect(dupeQuestions).toHaveLength(1);
    expect(dupeQuestions[0].prompt).toBe('Rate it?');
    expect(dupeQuestions[0].id).not.toBe(state.questions.find((q) => q.choreKey === choreKey)?.id);
  });

  test('throws on choreId collision in target pack', async () => {
    const choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Clash Source',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    await expect(
      useAppStore.getState().duplicateChore(choreKey, 'Clash Source', 'personal')
    ).rejects.toThrow();
  });

  test('duplicates into a different pack', async () => {
    const targetPackId = await useAppStore.getState().addPack('Dupe Target Pack');
    const choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Cross Pack Source',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    const newKey = await useAppStore.getState().duplicateChore(choreKey, 'Cross Pack Source', targetPackId);

    expect(newKey).toBe(`${targetPackId}/cross-pack-source`);
    expect(useAppStore.getState().chores.find((c) => c.key === newKey)?.packId).toBe(targetPackId);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun test src/store/choreActions.test.ts
```

Expected: `useAppStore.getState().duplicateChore is not a function`

- [ ] **Step 3: Add `duplicateChore` to the `AppState` interface**

```typescript
duplicateChore: (choreKey: string, newTitle: string, targetPackId: string) => Promise<string>;
```

- [ ] **Step 4: Implement `duplicateChore`**

Add after `moveChore` in the store implementation:

```typescript
duplicateChore: async (choreKey, newTitle, targetPackId) => {
  const { db, chores, questions } = get();
  if (!db) throw new Error('DB not initialised');

  const source = chores.find((c) => c.key === choreKey);
  if (!source) throw new Error(`Chore not found: ${choreKey}`);

  const newChoreId = titleToFilename(newTitle.trim());
  const newKey = `${targetPackId}/${newChoreId}`;

  if (chores.some((c) => c.key === newKey)) {
    throw new Error(`Chore ID "${newChoreId}" already exists in pack "${targetPackId}"`);
  }

  const newChore: Chore = {
    ...source,
    key: newKey,
    choreId: newChoreId,
    packId: targetPackId,
    title: newTitle.trim(),
    createdAt: new Date().toISOString(),
  };

  const sourceQuestions = questions.filter((q) => q.choreKey === choreKey);
  const newQuestions = sourceQuestions.map((q) => ({
    ...q,
    id: crypto.randomUUID(),
    choreKey: newKey,
  }));

  const tx = db.transaction(['chores', 'questions'], 'readwrite');
  await tx.objectStore('chores').put(newChore);
  for (const q of newQuestions) {
    await tx.objectStore('questions').put(q);
  }
  await tx.done;

  set((state) => ({
    chores: [...state.chores, newChore],
    questions: [...state.questions, ...newQuestions],
  }));

  return newKey;
},
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
bun test src/store/choreActions.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/store/index.ts src/store/choreActions.test.ts
git commit -m "feat: add duplicateChore store action"
```

---

## Task 5: Pack selector in `ChoreFormModal` edit mode

In edit mode, the pack field currently shows static text. Replace it with a dropdown that checks for choreId collision and, on save, calls `moveChore` if the pack changed.

**Files:**
- Modify: `src/components/chores/ChoreFormModal.tsx`

- [ ] **Step 1: Add `moveChore` to the store reads at the top of the component**

In `ChoreFormModal.tsx`, add `moveChore` to the store subscriptions:

```typescript
const moveChore = useAppStore((s) => s.moveChore);
const chores = useAppStore((s) => s.chores);
```

- [ ] **Step 2: Add `pack` to the `FormErrors` interface**

```typescript
interface FormErrors {
  title?: string;
  interval?: string;
  startDate?: string;
  questions?: string;
  pack?: string;
}
```

- [ ] **Step 3: Add a collision-check handler**

Add this function inside the component, before `validate()`:

```typescript
function handlePackChange(newPackId: string) {
  setSelectedPackId(newPackId);
  if (!chore) return;
  const collision = chores.some(
    (c) => c.packId === newPackId && c.choreId === chore.choreId && c.key !== chore.key,
  );
  setErrors((prev) => ({
    ...prev,
    pack: collision
      ? `A chore with ID "${chore.choreId}" already exists in this pack.`
      : undefined,
  }));
}
```

- [ ] **Step 4: Replace the static pack display in edit mode**

Find the pack field block (lines ~165–178) and replace the `isEdit` branch:

```tsx
<div>
  <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-pack">Pack</label>
  <select
    id="chore-pack"
    value={selectedPackId}
    onChange={(e) => isEdit ? handlePackChange(e.target.value) : setSelectedPackId(e.target.value)}
    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
      errors.pack ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-300'
    }`}
  >
    {packs.map((p) => (
      <option key={p.id} value={p.id}>{p.manifest.title}</option>
    ))}
  </select>
  {errors.pack && <p className="mt-1 text-xs text-red-600">{errors.pack}</p>}
</div>
```

- [ ] **Step 5: Disable save when there is a pack error**

Find the submit button and update the `disabled` prop:

```tsx
<button
  type="submit"
  disabled={submitting || !!errors.pack}
  className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
    submitting || errors.pack ? 'cursor-not-allowed bg-blue-300' : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
  }`}
>
```

- [ ] **Step 6: Call `moveChore` in `handleSubmit` when pack changed (edit mode)**

Replace the edit-mode block inside `handleSubmit`:

```typescript
if (isEdit && chore) {
  const packChanged = selectedPackId !== chore.packId;
  if (packChanged) {
    const moved = await moveChore(chore.key, selectedPackId);
    if (!moved) {
      setErrors((prev) => ({
        ...prev,
        pack: `A chore with ID "${chore.choreId}" already exists in this pack.`,
      }));
      setSubmitting(false);
      return;
    }
  }

  const activeChoreKey = packChanged
    ? `${selectedPackId}/${chore.choreId}`
    : chore.key;

  await updateChore({
    ...chore,
    key: activeChoreKey,
    packId: selectedPackId,
    title: title.trim(),
    description: description.trim() || undefined,
    xpSize,
    recurrence: { frequency, interval: Number(interval), startDate, windowStartTime },
    repeatable,
  });

  if (questionDrafts.length > 0 || initialQuestions.length > 0) {
    const updatedDrafts = questionDrafts.map((d) => ({ ...d, choreKey: activeChoreKey }));
    await saveQuestions(activeChoreKey, updatedDrafts);
  }
}
```

- [ ] **Step 7: Run unit tests**

```bash
bun run typecheck && bun test src/
```

Expected: no type errors, all tests pass.

- [ ] **Step 8: Smoke-test in the browser**

Start the dev server and open the app:

```bash
bun run dev
```

Open a chore edit modal, change its pack to another pack, confirm no inline error for a valid move, confirm inline error and disabled save when a collision exists.

- [ ] **Step 9: Commit**

```bash
git add src/components/chores/ChoreFormModal.tsx
git commit -m "feat: add pack selector in chore edit modal with collision check"
```

---

## Task 6: `PackDeletionDialog` + wire into `PackDashboard`

**Files:**
- Create: `src/components/packs/PackDeletionDialog.tsx`
- Modify: `src/components/packs/PackDashboard.tsx`

- [ ] **Step 1: Create `PackDeletionDialog.tsx`**

```tsx
// src/components/packs/PackDeletionDialog.tsx
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import { resolveChoreIdCollision } from '@/chores/resolveCollision';
import type { Pack, Chore } from '@/types';
import type { ChoreDisposition } from '@/types';

interface Props {
  pack: Pack;
  chores: Chore[];
  onClose: () => void;
}

export default function PackDeletionDialog({ pack, chores, onClose }: Props) {
  const allChores = useAppStore((s) => s.chores);
  const packs = useAppStore((s) => s.packs);
  const deletePack = useAppStore((s) => s.deletePack);
  const navigate = useNavigate();

  const otherPacks = packs.filter((p) => p.id !== pack.id);
  const [targetPackId, setTargetPackId] = useState(otherPacks[0]?.id ?? '');
  const [actions, setActions] = useState<Record<string, 'delete' | 'move'>>(
    Object.fromEntries(chores.map((c) => [c.key, 'move'])),
  );
  const [submitting, setSubmitting] = useState(false);

  const resolvedNames = useMemo(() => {
    const targetChores = allChores.filter((c) => c.packId === targetPackId);
    const existingIds = new Set(targetChores.map((c) => c.choreId));
    const result = new Map<string, { choreId: string; title: string }>();
    for (const chore of chores) {
      if (actions[chore.key] !== 'move') continue;
      const resolved = resolveChoreIdCollision(chore.choreId, chore.title, existingIds);
      result.set(chore.key, resolved);
      existingIds.add(resolved.choreId);
    }
    return result;
  }, [chores, actions, targetPackId, allChores]);

  function applyAll(action: 'delete' | 'move') {
    setActions(Object.fromEntries(chores.map((c) => [c.key, action])));
  }

  async function handleConfirm() {
    setSubmitting(true);
    const dispositions: ChoreDisposition[] = chores.map((chore) => {
      const action = actions[chore.key];
      if (action === 'move') {
        const resolved = resolvedNames.get(chore.key) ?? { choreId: chore.choreId, title: chore.title };
        return { choreKey: chore.key, action, targetPackId, ...resolved };
      }
      return { choreKey: chore.key, action };
    });
    await deletePack(pack.id, dispositions);
    navigate('/');
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] flex flex-col">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">
          Delete "{pack.manifest.title}"
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Choose what to do with each chore. Completions are always preserved.
        </p>

        <div className="mb-3 flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Move chores to:</label>
          <select
            value={targetPackId}
            onChange={(e) => setTargetPackId(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {otherPacks.map((p) => (
              <option key={p.id} value={p.id}>{p.manifest.title}</option>
            ))}
          </select>
        </div>

        <div className="mb-3 flex gap-2">
          <button
            onClick={() => applyAll('move')}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            Move all
          </button>
          <button
            onClick={() => applyAll('delete')}
            className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            Delete all
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {chores.map((chore) => {
            const action = actions[chore.key];
            const resolved = resolvedNames.get(chore.key);
            return (
              <div key={chore.key} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{chore.title}</p>
                  {action === 'move' && resolved && resolved.title !== chore.title && (
                    <p className="text-xs text-amber-600">Will be renamed to "{resolved.title}"</p>
                  )}
                </div>
                <div className="flex gap-1 ml-2 shrink-0">
                  <button
                    onClick={() => setActions((prev) => ({ ...prev, [chore.key]: 'move' }))}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      action === 'move'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    Move
                  </button>
                  <button
                    onClick={() => setActions((prev) => ({ ...prev, [chore.key]: 'delete' }))}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      action === 'delete'
                        ? 'bg-red-100 text-red-700'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? 'Deleting…' : 'Delete Pack'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `PackDashboard.tsx` to use the dialog**

Replace the entire `handleDelete` function and add dialog state:

```typescript
const [showDeletionDialog, setShowDeletionDialog] = useState(false);

async function handleDelete() {
  if (!pack) return;
  if (packChores.length === 0) {
    const confirmed = window.confirm(`Delete "${pack.manifest.title}"? This cannot be undone.`);
    if (!confirmed) return;
    await deletePack(pack.id);
    navigate('/');
  } else {
    setShowDeletionDialog(true);
  }
}
```

Add the import at the top:

```typescript
import PackDeletionDialog from './PackDeletionDialog';
```

Add the dialog to the JSX, after the closing `</div>` of the component:

```tsx
{showDeletionDialog && pack && (
  <PackDeletionDialog
    pack={pack}
    chores={packChores}
    onClose={() => setShowDeletionDialog(false)}
  />
)}
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Smoke-test in the browser**

```bash
bun run dev
```

- Navigate to a pack with chores → click Delete Pack → dialog appears with chore list
- Toggle delete/move per chore and use "Move all" / "Delete all" buttons
- Select target pack → chores set to Move show resolved names when collision detected
- Click Delete Pack → pack removed, redirected to Dashboard
- Navigate to a pack with no chores → click Delete Pack → simple confirm dialog, pack deleted

- [ ] **Step 5: Commit**

```bash
git add src/components/packs/PackDeletionDialog.tsx src/components/packs/PackDashboard.tsx
git commit -m "feat: add PackDeletionDialog with per-chore delete/move disposition (#7)"
```

---

## Task 7: `DuplicateChoreDialog` + Duplicate button on `ChoreCard`

**Files:**
- Create: `src/components/chores/DuplicateChoreDialog.tsx`
- Modify: `src/components/dashboard/ChoreCard.tsx`

- [ ] **Step 1: Create `DuplicateChoreDialog.tsx`**

```tsx
// src/components/chores/DuplicateChoreDialog.tsx
import { useState } from 'react';
import { useAppStore } from '@/store';
import { titleToFilename } from '@/cdp/filename';
import type { Chore } from '@/types';

interface Props {
  chore: Chore;
  onClose: () => void;
  onDuplicateAndEdit: (newChoreKey: string) => void;
}

export default function DuplicateChoreDialog({ chore, onClose, onDuplicateAndEdit }: Props) {
  const packs = useAppStore((s) => s.packs);
  const chores = useAppStore((s) => s.chores);
  const duplicateChore = useAppStore((s) => s.duplicateChore);

  const [selectedPackId, setSelectedPackId] = useState(chore.packId);
  const [name, setName] = useState(`${chore.title} (copy)`);
  const [nameError, setNameError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  function checkCollision(packId: string, title: string): boolean {
    const choreId = titleToFilename(title.trim());
    const collision = chores.some((c) => c.packId === packId && c.choreId === choreId);
    if (collision) {
      setNameError(`A chore with ID "${choreId}" already exists in this pack.`);
      return true;
    }
    setNameError(undefined);
    return false;
  }

  function handlePackChange(newPackId: string) {
    const defaultName = newPackId === chore.packId
      ? `${chore.title} (copy)`
      : chore.title;
    setSelectedPackId(newPackId);
    setName(defaultName);
    checkCollision(newPackId, defaultName);
  }

  function handleNameChange(newName: string) {
    setName(newName);
    checkCollision(selectedPackId, newName);
  }

  async function submit(andEdit: boolean) {
    if (checkCollision(selectedPackId, name)) return;
    setSubmitting(true);
    try {
      const newKey = await duplicateChore(chore.key, name, selectedPackId);
      if (andEdit) {
        onDuplicateAndEdit(newKey);
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Duplicate chore</h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="dup-pack">
              Pack
            </label>
            <select
              id="dup-pack"
              value={selectedPackId}
              onChange={(e) => handlePackChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {packs.map((p) => (
                <option key={p.id} value={p.id}>{p.manifest.title}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="dup-name">
              Name
            </label>
            <input
              id="dup-name"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                nameError ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-300'
              }`}
            />
            {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => submit(false)}
            disabled={submitting || !!nameError || !name.trim()}
            className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            Duplicate
          </button>
          <button
            onClick={() => submit(true)}
            disabled={submitting || !!nameError || !name.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Duplicate & Edit
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Duplicate button and dialog to `ChoreCard.tsx`**

Add these imports:

```typescript
import DuplicateChoreDialog from '@/components/chores/DuplicateChoreDialog';
```

Add state inside the component:

```typescript
const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
const [editAfterDuplicateKey, setEditAfterDuplicateKey] = useState<string | null>(null);
const allChores = useAppStore((s) => s.chores);
```

Add the Duplicate button next to the Archive button (inside the `flex gap-1 items-center` div):

```tsx
<button
  onClick={() => setShowDuplicateDialog(true)}
  title="Duplicate chore"
  className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
>
  Duplicate
</button>
```

Add the dialogs after the existing `{showEditModal && ...}` block:

```tsx
{showDuplicateDialog && (
  <DuplicateChoreDialog
    chore={chore}
    onClose={() => setShowDuplicateDialog(false)}
    onDuplicateAndEdit={(newKey) => {
      setShowDuplicateDialog(false);
      setEditAfterDuplicateKey(newKey);
    }}
  />
)}

{editAfterDuplicateKey && (() => {
  const dupeChore = allChores.find((c) => c.key === editAfterDuplicateKey);
  return dupeChore ? (
    <ChoreFormModal
      chore={dupeChore}
      packId={dupeChore.packId}
      onClose={() => setEditAfterDuplicateKey(null)}
    />
  ) : null;
})()}
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Smoke-test in the browser**

```bash
bun run dev
```

- Click "Duplicate" on a chore card → dialog appears with name pre-filled as "{title} (copy)"
- Change pack to another → name resets to original title (no "(copy)")
- Type a name that conflicts → inline error shown, Duplicate button disabled
- Click Duplicate → dialog closes, new chore card appears
- Click Duplicate & Edit → dialog closes, edit modal opens for the new chore
- Cancel edit → new chore remains (no rollback)

- [ ] **Step 5: Run full test suite**

```bash
bun run typecheck && bun test src/ && bun run test:e2e
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/chores/DuplicateChoreDialog.tsx src/components/dashboard/ChoreCard.tsx
git commit -m "feat: add DuplicateChoreDialog and Duplicate button on chore cards (#8)"
```
