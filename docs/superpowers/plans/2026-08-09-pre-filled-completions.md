# Pre-filled Completions (Targets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pre-filled completion targets to chores — a finite set of expected answer-sets the user works through, with sortable picker UI, optional set-completion XP bonus, and a celebration screen on set completion.

**Architecture:** Targets are a new IndexedDB store (DB_VERSION 4→5) loaded into Zustand alongside existing state. `Completion` and `Chore` gain optional fields for target linking and bonus XP. Completion flow forks: `CompleteButton` opens `TargetPickerModal` (3-step: select → fill remaining answers → celebrate) instead of `CompletionModal`. A shared `AnswerForm` is extracted from `CompletionModal`. Target management lives in a new `TargetBuilder` section inside `ChoreFormModal` with soft mutual exclusivity with Quick Answer Sets.

**Tech Stack:** TypeScript, React, Zustand, IndexedDB (idb v8), Zod, Tailwind CSS, Radix UI (Dialog), canvas-confetti, bun/vitest

**Spec:** `docs/superpowers/specs/2026-08-09-pre-filled-completions-design.md`

---

## File Map

**Create:**
- `src/db/targets.ts` — DB CRUD helpers for targets
- `src/db/targets.test.ts` — tests for DB helpers
- `src/components/completion/AnswerForm.tsx` — extracted answer fields (shared by CompletionModal and TargetPickerModal)
- `src/components/chores/TargetsTable.tsx` — sortable targets table with show/hide completed and optional radio selection
- `src/components/chores/TargetsTable.test.ts` — unit tests for sort/filter logic
- `src/components/chores/TargetFormModal.tsx` — 2-step secondary modal for adding/editing a single target
- `src/components/chores/TargetBuilder.tsx` — target list manager inside ChoreFormModal
- `src/components/chores/TargetPickerModal.tsx` — 3-step completion flow for target chores

**Modify:**
- `src/types/index.ts` — add `Target`; extend `Completion`, `Chore`, `AppState`
- `src/db/schema.ts` — add `targets` store to `TasksHarmonyDB`
- `src/db/index.ts` — bump `DB_VERSION` 4→5, add targets store in upgrade handler
- `src/schemas/validate.ts` — add `targetSchema`; update `completionSchema`, `choreSchema`, `appStateZodSchema`
- `src/store/index.ts` — add `targets` to state/interface, `saveTargets`, `linkCompletionToTarget`; update `recordCompletion`, `deleteChore`, `init`, `reload`
- `src/sync/export.ts` — include targets in `exportAppState`
- `src/components/completion/CompletionModal.tsx` — refactor to use `AnswerForm`
- `src/components/chores/ChoreFormModal.tsx` — add `TargetBuilder` section + mutual exclusivity with QAS
- `src/components/chores/CompleteButton.tsx` — open `TargetPickerModal` when chore has targets
- `src/components/dashboard/ChoreCard.tsx` — add target progress bar
- `src/components/chores/ChorePage.tsx` — unified completion + pending-targets table with toggle

---

## Task 1: Types, DB schema, and Zod validation

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/db/index.ts`
- Modify: `src/schemas/validate.ts`

- [ ] **Step 1: Add `Target` type and extend `Completion`, `Chore`, `AppState` in `src/types/index.ts`**

Add after the `QuickAnswerSet` interface:

```typescript
export interface Target {
  id: string;
  choreKey: string;
  order: number;
  answers: Answer[];
}
```

Extend `Completion` (add two optional fields after `answers`):

```typescript
export interface Completion {
  id: string;
  choreKey: string;
  completedAt: string;
  xpEarned: number;
  streak: number;
  answers: Answer[];
  targetId?: string;           // links this completion to a target
  setCompletionBonus?: number; // bonus XP included in xpEarned (triggering completion only)
}
```

Extend `Chore` (add one optional field after `createdAt`):

```typescript
export interface Chore {
  key: string;
  choreId: string;
  packId: string;
  title: string;
  description?: string;
  xpSize: XPSize | number;
  recurrence: Recurrence;
  repeatable: boolean;
  active: boolean;
  duePeriod?: DuePeriod;
  createdAt: string;
  completionBonusXPSize?: XPSize | number; // absent = no set bonus
  syncStatus?: ChoreSyncStatus;
}
```

Extend `AppState` (add `targets` after `quickAnswerSets`):

```typescript
export interface AppState {
  schemaVersion: 1;
  exportedAt: string;
  packs: Pack[];
  chores: Chore[];
  questions: Question[];
  completions: Completion[];
  xpSettings: XPSettings[];
  profile: UserProfile;
  syncState: SyncState;
  quickAnswerSets: QuickAnswerSet[];
  targets: Target[];
}
```

- [ ] **Step 2: Add `targets` store to `TasksHarmonyDB` in `src/db/schema.ts`**

Add `Target` to the import:
```typescript
import type {
  Pack, Chore, Question, Completion,
  XPSettings, UserProfile, SyncState, QuickAnswerSet, Target,
} from '@/types';
```

Add `targets` to the interface after `quickAnswerSets`:
```typescript
export interface TasksHarmonyDB extends DBSchema {
  packs:           { key: string; value: Pack };
  chores:          { key: string; value: Chore; indexes: { 'by-pack': string } };
  questions:       { key: string; value: Question; indexes: { 'by-chore': string } };
  completions:     { key: string; value: Completion; indexes: { 'by-chore': string; 'by-date': string } };
  xpSettings:      { key: string; value: XPSettings };
  profile:         { key: string; value: UserProfile };
  syncState:       { key: string; value: SyncState };
  quickAnswerSets: { key: string; value: QuickAnswerSet; indexes: { 'by-chore': string } };
  credentials:     { key: string; value: SyncCredentials };
  targets:         { key: string; value: Target; indexes: { 'by-chore': string } };
}
```

- [ ] **Step 3: Bump DB_VERSION and add targets store in `src/db/index.ts`**

Change line 11:
```typescript
const DB_VERSION = 5;
```

Add after the `oldVersion < 4` block (before the closing brace of the upgrade callback):
```typescript
      if (oldVersion < 5) {
        const targets = db.createObjectStore('targets', { keyPath: 'id' });
        targets.createIndex('by-chore', 'choreKey');
      }
```

- [ ] **Step 4: Update Zod schemas in `src/schemas/validate.ts`**

Add `targetSchema` after `quickAnswerSetSchema`:
```typescript
const targetSchema = z.object({
  id: z.string(),
  choreKey: z.string(),
  order: z.number().int(),
  answers: z.array(answerSchema),
}).strict();
```

Update `completionSchema` (add two optional fields before `.strict()`):
```typescript
const completionSchema = z.object({
  id: z.string(),
  choreKey: z.string(),
  completedAt: z.string(),
  xpEarned: z.number(),
  streak: z.number(),
  answers: z.array(answerSchema),
  targetId: z.string().optional(),
  setCompletionBonus: z.number().optional(),
}).strict();
```

Update `choreSchema` (add `completionBonusXPSize` optional field after `createdAt`):
```typescript
const choreSchema = z.object({
  key: z.string(),
  choreId: z.string(),
  packId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  xpSize: xpSizeSchema,
  recurrence: z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().int().min(1),
    startDate: z.string(),
    windowStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }).strict(),
  repeatable: z.boolean(),
  active: z.boolean(),
  duePeriod: duePeriodSchema.optional(),
  createdAt: z.string(),
  completionBonusXPSize: xpSizeSchema.optional(),
  syncStatus: z.enum(['in-sync', 'out-of-sync']).optional(),
}).strict();
```

Update `appStateZodSchema` (add `targets` after `quickAnswerSets`):
```typescript
const appStateZodSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  packs: z.array(packSchema),
  chores: z.array(choreSchema),
  questions: z.array(stateQuestionSchema),
  completions: z.array(completionSchema),
  xpSettings: z.array(xpSettingsSchema),
  profile: profileSchema,
  syncState: syncStateSchema,
  quickAnswerSets: z.array(quickAnswerSetSchema).optional(),
  targets: z.array(targetSchema).optional(),
}).strict();
```

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/db/schema.ts src/db/index.ts src/schemas/validate.ts
git commit -m "feat(targets): types, DB schema v5, and Zod schemas"
```

---

## Task 2: DB helpers for targets + export

**Files:**
- Create: `src/db/targets.ts`
- Create: `src/db/targets.test.ts`
- Modify: `src/sync/export.ts`

- [ ] **Step 1: Write failing tests in `src/db/targets.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { openDB } from './index';
import { getAllTargets, getTargetsByChore, putTarget, deleteTarget } from './targets';
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from './schema';
import type { Target } from '@/types';

let db: IDBPDatabase<TasksHarmonyDB>;

beforeEach(async () => {
  db = await openDB('test-targets-' + crypto.randomUUID());
});

describe('getAllTargets', () => {
  it('returns empty array when no targets', async () => {
    expect(await getAllTargets(db)).toEqual([]);
  });

  it('returns all stored targets', async () => {
    const t: Target = { id: 'a', choreKey: 'p/c', order: 0, answers: [] };
    await putTarget(db, t);
    expect(await getAllTargets(db)).toContainEqual(t);
  });
});

describe('getTargetsByChore', () => {
  it('returns only targets for the given choreKey', async () => {
    await putTarget(db, { id: 'a', choreKey: 'p/c1', order: 0, answers: [] });
    await putTarget(db, { id: 'b', choreKey: 'p/c2', order: 0, answers: [] });
    const results = await getTargetsByChore(db, 'p/c1');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('a');
  });
});

describe('deleteTarget', () => {
  it('removes the target', async () => {
    await putTarget(db, { id: 'a', choreKey: 'p/c', order: 0, answers: [] });
    await deleteTarget(db, 'a');
    expect(await getAllTargets(db)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test src/db/targets.test.ts
```

Expected: FAIL with "Cannot find module './targets'"

- [ ] **Step 3: Implement `src/db/targets.ts`**

```typescript
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from './schema';
import type { Target } from '@/types';

export const getAllTargets = (db: IDBPDatabase<TasksHarmonyDB>): Promise<Target[]> =>
  db.getAll('targets');

export const getTargetsByChore = (db: IDBPDatabase<TasksHarmonyDB>, choreKey: string): Promise<Target[]> =>
  db.getAllFromIndex('targets', 'by-chore', choreKey);

export const putTarget = (db: IDBPDatabase<TasksHarmonyDB>, target: Target): Promise<string> =>
  db.put('targets', target);

export const deleteTarget = (db: IDBPDatabase<TasksHarmonyDB>, id: string): Promise<void> =>
  db.delete('targets', id);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test src/db/targets.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Re-export from `src/db/index.ts`**

Add to the imports section at the top (after the existing import block) and re-export:
```typescript
export { getAllTargets, getTargetsByChore, putTarget, deleteTarget } from './targets';
```

- [ ] **Step 6: Include targets in `src/sync/export.ts`**

Update `exportAppState` to load and include targets. Replace the function:

```typescript
import {
  getPacks, getAllChores, getAllQuestions, getAllCompletions,
  getXPSettings, getProfile, getSyncState, getAllQuickAnswerSets, getAllTargets,
} from '@/db/index';

export async function exportAppState(db: IDBPDatabase<TasksHarmonyDB>): Promise<AppState> {
  const [packs, chores, questions, completions, xpSettings, profile, syncState, quickAnswerSets, targets] =
    await Promise.all([
      getPacks(db), getAllChores(db), getAllQuestions(db), getAllCompletions(db),
      getXPSettings(db), getProfile(db), getSyncState(db), getAllQuickAnswerSets(db),
      getAllTargets(db),
    ]);
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    packs, chores, questions, completions, xpSettings,
    quickAnswerSets,
    targets,
    profile: profile!,
    syncState: syncState!,
  };
}
```

- [ ] **Step 7: Typecheck and run all tests**

```bash
bun run typecheck && bun run test
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/db/targets.ts src/db/targets.test.ts src/db/index.ts src/sync/export.ts
git commit -m "feat(targets): DB helpers and export"
```

---

## Task 3: Store — targets state and actions

**Files:**
- Modify: `src/store/index.ts`

This is the most complex task. Read `src/store/index.ts` in full before starting — the complete file was returned by codegraph.

- [ ] **Step 1: Add `Target` to store imports and define `DraftTarget` type**

At the top of `src/store/index.ts`, add `Target` to the types import:
```typescript
import type {
  Chore, Completion, MultiplierQuestion, Pack, PackManifest,
  Question, XPSettings, UserProfile, SyncState, Answer,
  QuickAnswerSet, Target,
} from '@/types';
```

Add `DraftTarget` type and import DB helpers (add alongside the existing `getAllQuickAnswerSets` import):
```typescript
import { getAllTargets, putTarget, deleteTarget } from '@/db';
```

Add `DraftTarget` type after the imports block:
```typescript
export interface DraftTarget {
  id: string;
  order: number;
  answers: Answer[];
  linkedCompletionId?: string;
  _deleted?: boolean;
}
```

- [ ] **Step 2: Extend the local `AppState` interface**

Add `targets`, `saveTargets`, and `linkCompletionToTarget` to the interface, and update `recordCompletion`:

```typescript
interface AppState {
  db: IDBPDatabase<TasksHarmonyDB> | null;
  loaded: boolean;
  packs: Pack[];
  chores: Chore[];
  completions: Completion[];
  questions: Question[];
  xpSettings: XPSettings[];
  profile: UserProfile | null;
  syncState: SyncState | null;
  quickAnswerSets: QuickAnswerSet[];
  targets: Target[];

  init: () => Promise<void>;
  reload: () => Promise<void>;
  addChore: (data: Omit<Chore, 'key' | 'choreId' | 'createdAt'>) => Promise<string>;
  updateChore: (chore: Chore) => Promise<void>;
  deactivateChore: (key: string) => Promise<void>;
  deleteChore: (key: string) => Promise<void>;
  recordCompletion: (choreKey: string, answers?: Answer[], targetId?: string) => Promise<{ setCompletionBonus?: number }>;
  amendCompletion: (id: string, patch: { completedAt: string; answers: Answer[] }) => Promise<void>;
  recordRetroactiveCompletion: (choreKey: string, data: { completedAt: string; answers: Answer[] }) => Promise<void>;
  updateProfile: (profile: UserProfile) => Promise<void>;
  updateSyncState: (state: SyncState) => Promise<void>;
  saveQuestions: (choreKey: string, drafts: DraftQuestion[]) => Promise<void>;
  saveTargets: (choreKey: string, drafts: DraftTarget[]) => Promise<void>;
  linkCompletionToTarget: (completionId: string, targetId: string) => Promise<void>;
  importCDP: (baseUrl: string, startDateOffsetDays?: number) => Promise<string>;
  updateCDP: (packId: string) => Promise<void>;
  addPack: (name: string) => Promise<string>;
  renamePack: (packId: string, newTitle: string) => Promise<void>;
  updatePackDescription: (packId: string, description: string) => Promise<void>;
  updatePackManifest: (packId: string, changes: Partial<PackManifest>) => Promise<void>;
  deletePack: (packId: string, dispositions?: ChoreDisposition[]) => Promise<void>;
  saveQuickAnswerSet: (qas: QuickAnswerSet) => Promise<void>;
  removeQuickAnswerSet: (id: string) => Promise<void>;
  moveChore: (choreKey: string, targetPackId: string) => Promise<boolean>;
  duplicateChore: (choreKey: string, newTitle: string, targetPackId: string) => Promise<string>;
}
```

- [ ] **Step 3: Add `targets: []` to initial state and update `init` and `reload`**

Add `targets: []` to the initial state object (after `quickAnswerSets: []`):
```typescript
  targets: [],
```

Update `init` — add `getAllTargets(db)` to the `Promise.all`:
```typescript
  init: async () => {
    if (get().loaded) return;
    const db = await openDB();
    const [packs, chores, completions, questions, xpSettings, profile, syncState, quickAnswerSets, targets] =
      await Promise.all([
        getPacks(db), getAllChores(db), getAllCompletions(db), getAllQuestions(db),
        getXPSettings(db), getProfile(db), getSyncState(db), getAllQuickAnswerSets(db),
        getAllTargets(db),
      ]);
    set({ db, loaded: true, packs, chores, completions, questions, xpSettings, profile, syncState, quickAnswerSets, targets });
  },
```

Update `reload` similarly:
```typescript
  reload: async () => {
    const { db } = get();
    if (!db) return;
    const [packs, chores, completions, questions, xpSettings, profile, syncState, quickAnswerSets, targets] =
      await Promise.all([
        getPacks(db), getAllChores(db), getAllCompletions(db), getAllQuestions(db),
        getXPSettings(db), getProfile(db), getSyncState(db), getAllQuickAnswerSets(db),
        getAllTargets(db),
      ]);
    set({ packs, chores, completions, questions, xpSettings, profile: profile ?? null, syncState: syncState ?? null, quickAnswerSets, targets });
  },
```

- [ ] **Step 4: Update `recordCompletion` to accept optional `targetId` and run set-completion bonus check**

Replace the `recordCompletion` action:
```typescript
  recordCompletion: async (choreKey, answers = [], targetId) => {
    const { db, chores, completions, xpSettings, profile } = get();
    if (!db) throw new Error('DB not initialised');

    const chore = chores.find((c) => c.key === choreKey);
    if (!chore) throw new Error(`Chore not found: ${choreKey}`);

    const chorePack = get().packs.find((p) => p.id === chore.packId);
    const packStreak = chorePack?.manifest.streak ?? true;
    const packDecay = chorePack?.manifest.decay ?? true;

    const now = recordCompletionWithTimestamp(new Date());

    const activeSettingsId = profile?.activeXPSettingsId;
    const activeSettings = xpSettings.find((s) => s.id === activeSettingsId) ?? xpSettings[0];
    if (!activeSettings) throw new Error('No XP settings found');

    const choreCompletions = completions.filter((c) => c.choreKey === choreKey);
    const streak = packStreak ? computeNewStreak(chore, choreCompletions, now) : 0;
    const totalCompletions = choreCompletions.length;
    const effectiveTotalCompletions = packDecay ? totalCompletions : 0;
    const { questions } = get();
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

    let newCompletion: Completion = {
      id: crypto.randomUUID(),
      choreKey,
      completedAt: now.toISOString(),
      xpEarned,
      streak,
      answers,
      ...(targetId ? { targetId } : {}),
    };

    // Set-completion bonus check
    let setCompletionBonus: number | undefined;
    if (targetId && chore.completionBonusXPSize !== undefined) {
      const { targets } = get();
      const choreTargets = targets.filter((t) => t.choreKey === choreKey);
      if (choreTargets.length > 0) {
        const allCompletionsAfter = [...completions, newCompletion];
        const allDone = choreTargets.every((t) =>
          allCompletionsAfter.some((c) => c.targetId === t.id),
        );
        const bonusAlreadyEarned = completions.some(
          (c) => c.choreKey === choreKey && c.setCompletionBonus,
        );
        if (allDone && !bonusAlreadyEarned) {
          const bonusXP = calculateXP(chore.completionBonusXPSize, 0, 0, activeSettings);
          setCompletionBonus = bonusXP;
          newCompletion = { ...newCompletion, xpEarned: xpEarned + bonusXP, setCompletionBonus: bonusXP };
        }
      }
    }

    await putCompletion(db, newCompletion);
    set((state) => ({ completions: [...state.completions, newCompletion] }));
    markDirty();
    return { setCompletionBonus };
  },
```

- [ ] **Step 5: Update `deleteChore` to also delete targets**

In the `deleteChore` action, find the section that builds the transaction. Add `'targets'` to the transaction stores and delete targets:

```typescript
  deleteChore: async (key) => {
    const { db, chores, completions, questions, quickAnswerSets, targets, packs } = get();
    if (!db) throw new Error('DB not initialised');

    const chore = chores.find((c) => c.key === key);
    if (!chore) return;

    const choreCompletions = completions.filter((c) => c.choreKey === key);
    const choreQuestions = questions.filter((q) => q.choreKey === key);
    const choreSets = quickAnswerSets.filter((s) => s.choreKey === key);
    const choreTargets = targets.filter((t) => t.choreKey === key);

    const choreXP = choreCompletions.reduce((sum, c) => sum + c.xpEarned, 0);
    const pack = packs.find((p) => p.id === chore.packId);

    const tx = db.transaction(['chores', 'questions', 'completions', 'quickAnswerSets', 'targets', 'packs'], 'readwrite');
    for (const c of choreCompletions) await tx.objectStore('completions').delete(c.id);
    for (const q of choreQuestions) await tx.objectStore('questions').delete(q.id);
    for (const s of choreSets) await tx.objectStore('quickAnswerSets').delete(s.id);
    for (const t of choreTargets) await tx.objectStore('targets').delete(t.id);
    await tx.objectStore('chores').delete(key);
    if (pack && choreXP > 0) {
      const updatedPack = {
        ...pack,
        manifest: { ...pack.manifest, deletedXP: (pack.manifest.deletedXP ?? 0) + choreXP },
        updatedAt: new Date().toISOString(),
      };
      await tx.objectStore('packs').put(updatedPack);
    }
    await tx.done;

    set((state) => ({
      chores: state.chores.filter((c) => c.key !== key),
      completions: state.completions.filter((c) => c.choreKey !== key),
      questions: state.questions.filter((q) => q.choreKey !== key),
      quickAnswerSets: state.quickAnswerSets.filter((s) => s.choreKey !== key),
      targets: state.targets.filter((t) => t.choreKey !== key),
      packs: pack && choreXP > 0
        ? state.packs.map((p) =>
            p.id === pack.id
              ? { ...p, manifest: { ...p.manifest, deletedXP: (p.manifest.deletedXP ?? 0) + choreXP } }
              : p,
          )
        : state.packs,
    }));
    markDirty();
  },
```

- [ ] **Step 6: Add `saveTargets` action**

Add after `saveQuestions`:
```typescript
  saveTargets: async (choreKey, drafts) => {
    const { db } = get();
    if (!db) throw new Error('DB not initialised');

    // Delete removed targets and clear their linked completions
    for (const draft of drafts.filter((d) => d._deleted)) {
      await deleteTarget(db, draft.id);
      // Clear targetId on any completions linked to this target
      const linkedCompletions = get().completions.filter((c) => c.targetId === draft.id);
      for (const c of linkedCompletions) {
        const { targetId: _removed, ...rest } = c;
        await putCompletion(db, rest as Completion);
      }
    }

    // Upsert active targets
    const toSave = drafts.filter((d) => !d._deleted);
    for (const draft of toSave) {
      const target: Target = { id: draft.id, choreKey, order: draft.order, answers: draft.answers };
      await putTarget(db, target);
      // Link completion if specified
      if (draft.linkedCompletionId) {
        const completion = get().completions.find((c) => c.id === draft.linkedCompletionId);
        if (completion) {
          const linked = { ...completion, targetId: draft.id };
          await putCompletion(db, linked);
        }
      }
    }

    // Reload targets and completions from DB
    const [updatedTargets, updatedCompletions] = await Promise.all([
      getAllTargets(db),
      getAllCompletions(db),
    ]);
    set({ targets: updatedTargets, completions: updatedCompletions });
    markDirty();
  },
```

Add `getAllCompletions` to the DB import at the top of the file (it is already there, but ensure it's included).

- [ ] **Step 7: Add `linkCompletionToTarget` action**

Add after `saveTargets`:
```typescript
  linkCompletionToTarget: async (completionId, targetId) => {
    const { db } = get();
    if (!db) throw new Error('DB not initialised');
    const completion = get().completions.find((c) => c.id === completionId);
    if (!completion) throw new Error(`Completion not found: ${completionId}`);
    const linked = { ...completion, targetId };
    await putCompletion(db, linked);
    set((state) => ({
      completions: state.completions.map((c) => (c.id === completionId ? linked : c)),
    }));
    markDirty();
  },
```

- [ ] **Step 8: Typecheck and run existing tests**

```bash
bun run typecheck && bun run test
```

Expected: all pass. If `recordCompletion` callers in tests pass only 2 args, they still work since `targetId` is optional.

- [ ] **Step 9: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(targets): store state, saveTargets, linkCompletionToTarget, recordCompletion bonus"
```

---

## Task 4: Extract `AnswerForm` from `CompletionModal`

**Files:**
- Create: `src/components/completion/AnswerForm.tsx`
- Modify: `src/components/completion/CompletionModal.tsx`

- [ ] **Step 1: Create `src/components/completion/AnswerForm.tsx`**

```tsx
import type { Question, Answer } from '@/types';
import AnswerField from './AnswerField';

interface Props {
  questions: Question[];
  answers: Record<string, string | number | boolean | null>;
  errors: Record<string, string>;
  onChange: (questionId: string, value: string | number | boolean | null) => void;
}

export default function AnswerForm({ questions, answers, errors, onChange }: Props) {
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  return (
    <div className="space-y-4">
      {sorted.map((question) => (
        <AnswerField
          key={question.id}
          question={question}
          value={answers[question.id] ?? null}
          error={errors[question.id]}
          onChange={(value) => onChange(question.id, value)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Refactor `src/components/completion/CompletionModal.tsx` to use `AnswerForm`**

```tsx
import { useState } from 'react';
import type { Question, Answer } from '@/types';
import { useAppStore } from '@/store';
import { validateAnswer } from '@/questions/validation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import AnswerForm from './AnswerForm';

interface Props {
  choreKey: string;
  questions: Question[];
  onClose: () => void;
}

export default function CompletionModal({ choreKey, questions, onClose }: Props) {
  const recordCompletion = useAppStore((s) => s.recordCompletion);
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>(
    () => Object.fromEntries(sortedQuestions.map((q) => [q.id, null])),
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
      await recordCompletion(choreKey, answerList);
      onClose();
    } finally { setSubmitting(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complete Chore</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Please answer the following questions to record your completion.</p>
        <form id="completion-form" onSubmit={handleSubmit} noValidate>
          <AnswerForm questions={sortedQuestions} answers={answers} errors={errors} onChange={handleChange} />
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="completion-form" disabled={submitting} className="bg-green-600 hover:bg-green-700 text-white disabled:bg-green-600 disabled:opacity-50">
            {submitting ? 'Saving…' : 'Submit & Complete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Typecheck and run tests**

```bash
bun run typecheck && bun run test
```

Expected: all pass (behaviour unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/components/completion/AnswerForm.tsx src/components/completion/CompletionModal.tsx
git commit -m "refactor: extract AnswerForm from CompletionModal"
```

---

## Task 5: `TargetsTable` component

**Files:**
- Create: `src/components/chores/TargetsTable.tsx`
- Create: `src/components/chores/TargetsTable.test.ts`

- [ ] **Step 1: Write failing tests in `src/components/chores/TargetsTable.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { filterAndSortTargets, getTargetCompletedAt, isTargetDone } from './TargetsTable';
import type { Target, Completion } from '@/types';

const t1: Target = { id: 't1', choreKey: 'p/c', order: 0, answers: [{ questionId: 'q1', value: 'Berlin' }] };
const t2: Target = { id: 't2', choreKey: 'p/c', order: 1, answers: [{ questionId: 'q1', value: 'Paris' }] };
const done: Completion = { id: 'c1', choreKey: 'p/c', completedAt: '2026-01-01T10:00:00Z', xpEarned: 10, streak: 1, answers: [], targetId: 't1' };

describe('isTargetDone', () => {
  it('returns true when a completion links to the target', () => {
    expect(isTargetDone(t1, [done])).toBe(true);
  });
  it('returns false when no completion links to the target', () => {
    expect(isTargetDone(t2, [done])).toBe(false);
  });
});

describe('getTargetCompletedAt', () => {
  it('returns the earliest linked completion timestamp', () => {
    const c2: Completion = { ...done, id: 'c2', completedAt: '2026-01-02T10:00:00Z' };
    expect(getTargetCompletedAt(t1, [done, c2])).toBe('2026-01-01T10:00:00Z');
  });
  it('returns null for a pending target', () => {
    expect(getTargetCompletedAt(t2, [done])).toBeNull();
  });
});

describe('filterAndSortTargets', () => {
  it('hides done targets when showCompleted is false', () => {
    const result = filterAndSortTargets([t1, t2], [done], [], false);
    expect(result.map(r => r.target.id)).toEqual(['t2']);
  });
  it('shows done targets when showCompleted is true', () => {
    const result = filterAndSortTargets([t1, t2], [done], [], true);
    expect(result.map(r => r.target.id)).toContain('t1');
  });
  it('sorts by question answer ascending', () => {
    const sorts = [{ key: 'question:q1' as const, dir: 'asc' as const }];
    const result = filterAndSortTargets([t2, t1], [], sorts, true);
    expect(result[0].target.id).toBe('t1'); // Berlin < Paris
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test src/components/chores/TargetsTable.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/chores/TargetsTable.tsx`**

```tsx
import { useState } from 'react';
import type { Target, Completion, Question } from '@/types';
import { getAnswerDisplay } from '@/questions/display';

type SortDir = 'asc' | 'desc';
type SortKey = 'completedAt' | `question:${string}`;
export interface SortEntry { key: SortKey; dir: SortDir; }

export interface TargetRow { target: Target; done: boolean; completedAt: string | null; }

export function isTargetDone(target: Target, completions: Completion[]): boolean {
  return completions.some((c) => c.targetId === target.id);
}

export function getTargetCompletedAt(target: Target, completions: Completion[]): string | null {
  const linked = completions
    .filter((c) => c.targetId === target.id)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  return linked[0]?.completedAt ?? null;
}

function getAnswerValue(target: Target, questionId: string): string | number | boolean | null {
  return target.answers.find((a) => a.questionId === questionId)?.value ?? null;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export function filterAndSortTargets(
  targets: Target[],
  completions: Completion[],
  sorts: SortEntry[],
  showCompleted: boolean,
): TargetRow[] {
  const rows: TargetRow[] = targets.map((t) => ({
    target: t,
    done: isTargetDone(t, completions),
    completedAt: getTargetCompletedAt(t, completions),
  }));

  const visible = showCompleted ? rows : rows.filter((r) => !r.done);

  if (sorts.length === 0) return visible;

  return [...visible].sort((a, b) => {
    for (const sort of sorts) {
      let result = 0;
      if (sort.key === 'completedAt') {
        result = compareValues(a.completedAt, b.completedAt);
      } else {
        const qId = sort.key.slice('question:'.length);
        result = compareValues(getAnswerValue(a.target, qId), getAnswerValue(b.target, qId));
      }
      if (result !== 0) return sort.dir === 'asc' ? result : -result;
    }
    return 0;
  });
}

function SortLabel({ sorts, colKey }: { sorts: SortEntry[]; colKey: SortKey }) {
  const idx = sorts.findIndex((s) => s.key === colKey);
  if (idx === -1) return <span className="ml-1 text-muted-foreground/40 text-xs">↕</span>;
  return (
    <span className="ml-1 text-xs">
      {sorts[idx].dir === 'asc' ? '↑' : '↓'}<sup>{idx + 1}</sup>
    </span>
  );
}

function clickHeader(sorts: SortEntry[], key: SortKey): SortEntry[] {
  const existing = sorts.find((s) => s.key === key);
  if (!existing) return [...sorts, { key, dir: 'asc' }];
  if (existing.dir === 'asc') return sorts.map((s) => s.key === key ? { ...s, dir: 'desc' } : s);
  return sorts.filter((s) => s.key !== key);
}

interface Props {
  targets: Target[];
  completions: Completion[];
  questions: Question[];
  showCompleted: boolean;
  interactive?: boolean;
  selectedTargetId?: string;
  onSelect?: (targetId: string) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function TargetsTable({ targets, completions, questions, showCompleted, interactive, selectedTargetId, onSelect }: Props) {
  const [sorts, setSorts] = useState<SortEntry[]>([]);
  const rows = filterAndSortTargets(targets, completions, sorts, showCompleted);
  const hasSorts = sorts.length > 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr className="border-b border-border">
            {interactive && <th className="py-2 pr-2 w-6" aria-label="Select" />}
            {questions.map((q) => (
              <th
                key={q.id}
                className="py-2 pr-4 font-medium text-foreground cursor-pointer select-none"
                onClick={() => setSorts((s) => clickHeader(s, `question:${q.id}`))}
              >
                {q.prompt}
                <SortLabel sorts={sorts} colKey={`question:${q.id}`} />
              </th>
            ))}
            {showCompleted && (
              <th
                className="py-2 pr-4 font-medium text-foreground whitespace-nowrap cursor-pointer select-none"
                onClick={() => setSorts((s) => clickHeader(s, 'completedAt'))}
              >
                Completed at
                <SortLabel sorts={sorts} colKey="completedAt" />
              </th>
            )}
            <th className="py-2 pl-4 font-normal">
              <button
                className={`text-xs text-muted-foreground hover:text-foreground underline${!hasSorts ? ' invisible' : ''}`}
                onClick={() => setSorts([])}
                tabIndex={hasSorts ? undefined : -1}
                aria-hidden={!hasSorts || undefined}
              >
                Reset sorting
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ target, done, completedAt }) => {
            const isSelected = selectedTargetId === target.id;
            return (
              <tr
                key={target.id}
                className={[
                  'border-b border-border',
                  done ? 'opacity-40' : '',
                  interactive && !done ? 'cursor-pointer hover:bg-muted' : '',
                  isSelected ? 'bg-muted' : '',
                ].join(' ')}
                onClick={interactive && !done && onSelect ? () => onSelect(target.id) : undefined}
              >
                {interactive && (
                  <td className="py-2 pr-2">
                    <input
                      type="radio"
                      checked={isSelected}
                      onChange={() => onSelect?.(target.id)}
                      disabled={done}
                      className="accent-primary"
                      aria-label={`Select target`}
                    />
                  </td>
                )}
                {questions.map((q) => (
                  <td key={q.id} className={`py-2 pr-4 ${done ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {getAnswerDisplay(target.answers, q)}
                  </td>
                ))}
                {showCompleted && (
                  <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                    {completedAt ? formatDate(completedAt) : '—'}
                  </td>
                )}
                <td />
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={questions.length + (interactive ? 1 : 0) + (showCompleted ? 1 : 0) + 1}
                  className="py-4 text-center text-sm text-muted-foreground italic">
                {showCompleted ? 'No targets.' : 'All targets completed.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
bun run test src/components/chores/TargetsTable.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/components/chores/TargetsTable.tsx src/components/chores/TargetsTable.test.ts
git commit -m "feat(targets): TargetsTable component with sort and show/hide completed"
```

---

## Task 6: `TargetFormModal`

**Files:**
- Create: `src/components/chores/TargetFormModal.tsx`

This 2-step modal is used in `TargetBuilder` for creating/editing targets. Step 1 shows existing unlinked completions as import suggestions. Step 2 is the answer form.

- [ ] **Step 1: Create `src/components/chores/TargetFormModal.tsx`**

```tsx
import { useState } from 'react';
import type { Question, Completion, Answer } from '@/types';
import { validateAnswer } from '@/questions/validation';
import { getAnswerDisplay } from '@/questions/display';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import AnswerForm from '@/components/completion/AnswerForm';
import type { DraftTarget } from '@/store';

interface Props {
  questions: Question[];
  unlinkdedCompletions: Completion[]; // completions with no targetId, for import suggestions
  initialDraft?: DraftTarget;         // present when editing; absent when adding new
  choreKey: string;
  onSave: (draft: DraftTarget) => void;
  onClose: () => void;
}

export default function TargetFormModal({ questions, unlinkdedCompletions, initialDraft, choreKey, onSave, onClose }: Props) {
  // Show step 1 only when adding new AND there are unlinked completions to suggest
  const showStep1 = !initialDraft && unlinkdedCompletions.length > 0;
  const [step, setStep] = useState<1 | 2>(showStep1 ? 1 : 2);

  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>(
    () => Object.fromEntries(
      questions.map((q) => [q.id, initialDraft?.answers.find((a) => a.questionId === q.id)?.value ?? null]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [linkedCompletionId, setLinkedCompletionId] = useState<string | undefined>(initialDraft?.linkedCompletionId);

  function handleImport(completion: Completion) {
    const imported = Object.fromEntries(
      questions.map((q) => [q.id, completion.answers.find((a) => a.questionId === q.id)?.value ?? null]),
    );
    setAnswers(imported);
    setLinkedCompletionId(completion.id);
    setStep(2);
  }

  function handleChange(questionId: string, value: string | number | boolean | null) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (errors[questionId]) setErrors((prev) => { const next = { ...prev }; delete next[questionId]; return next; });
  }

  function handleSave() {
    const newErrors: Record<string, string> = {};
    // Validate non-null answers against their question constraints
    for (const q of questions) {
      const val = answers[q.id] ?? null;
      if (val !== null) {
        const answer: Answer = { questionId: q.id, value: val };
        const err = validateAnswer(answer, { ...q, required: true });
        if (err) newErrors[q.id] = err;
      }
    }
    // Require at least one filled answer
    const hasAny = questions.some((q) => answers[q.id] !== null);
    if (!hasAny) {
      // Mark first question with a generic error
      newErrors[questions[0]?.id ?? ''] = 'At least one answer must be provided.';
    }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    const answerList: Answer[] = questions
      .filter((q) => answers[q.id] !== null)
      .map((q) => ({ questionId: q.id, value: answers[q.id]! }));

    onSave({
      id: initialDraft?.id ?? crypto.randomUUID(),
      order: initialDraft?.order ?? 0,
      answers: answerList,
      linkedCompletionId,
    });
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{initialDraft ? 'Edit Target' : 'Add Target'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Select a past completion to pre-fill this target, or skip to enter manually.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 pr-4 font-medium text-foreground whitespace-nowrap">Completed at</th>
                      {questions.map((q) => (
                        <th key={q.id} className="py-2 pr-4 font-medium text-foreground">{q.prompt}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {unlinkdedCompletions.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-border hover:bg-muted cursor-pointer"
                        onClick={() => handleImport(c)}
                      >
                        <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{formatDate(c.completedAt)}</td>
                        {questions.map((q) => (
                          <td key={q.id} className="py-2 pr-4 text-muted-foreground">{getAnswerDisplay(c.answers, q)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 pt-1">
              <p className="text-sm text-muted-foreground">Pre-fill at least one answer for this target. Leave others blank to have them filled at completion time.</p>
              <AnswerForm
                questions={questions}
                answers={answers}
                errors={errors}
                onChange={handleChange}
              />
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4 mt-4">
          {step === 1 ? (
            <>
              <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
              <Button variant="outline" type="button" onClick={() => setStep(2)}>Skip — enter manually</Button>
            </>
          ) : (
            <>
              {showStep1 && (
                <Button variant="outline" type="button" onClick={() => setStep(1)}>← Back</Button>
              )}
              {!showStep1 && <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>}
              <Button type="button" onClick={handleSave} className="bg-green-600 hover:bg-green-700 text-white">
                Save target
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Note: `DraftTarget` is exported from `src/store/index.ts` (added in Task 3, Step 1). Import it from there.

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chores/TargetFormModal.tsx
git commit -m "feat(targets): TargetFormModal (2-step: import or manual)"
```

---

## Task 7: `TargetPickerModal`, canvas-confetti, and `CompleteButton` routing

**Files:**
- Create: `src/components/chores/TargetPickerModal.tsx`
- Modify: `src/components/chores/CompleteButton.tsx`

- [ ] **Step 1: Install canvas-confetti**

```bash
bun add canvas-confetti && bun add -d @types/canvas-confetti
```

Expected: package.json updated.

- [ ] **Step 2: Create `src/components/chores/TargetPickerModal.tsx`**

```tsx
import { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import type { Question, Answer, Completion } from '@/types';
import { useAppStore } from '@/store';
import { validateAnswer } from '@/questions/validation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import AnswerForm from '@/components/completion/AnswerForm';
import TargetsTable from './TargetsTable';

interface Props {
  choreKey: string;
  questions: Question[];
  onClose: () => void;
}

type Step = 'pick' | 'answer' | 'celebrate';

function CelebrationStep({ bonusXP, totalTargets, onClose }: { bonusXP?: number; totalTargets: number; onClose: () => void }) {
  useEffect(() => {
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <img
        src="/trophy.svg"
        alt="Trophy"
        className="w-32 h-32 animate-[bounce-in_0.5s_ease-out]"
        style={{ animation: 'trophy-bounce 0.5s ease-out' }}
      />
      <style>{`
        @keyframes trophy-bounce {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .trophy-bounce { animation: trophy-bounce 0.5s ease-out; }
      `}</style>
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Set Complete!</h2>
        <p className="text-muted-foreground text-sm">
          You've completed all {totalTargets} target{totalTargets !== 1 ? 's' : ''}.
        </p>
        {bonusXP !== undefined && (
          <p className="mt-2 text-amber-600 dark:text-amber-400 font-semibold text-lg">
            +{bonusXP} XP bonus
          </p>
        )}
      </div>
    </div>
  );
}

export default function TargetPickerModal({ choreKey, questions, onClose }: Props) {
  const targets = useAppStore((s) => s.targets.filter((t) => t.choreKey === choreKey));
  const completions = useAppStore((s) => s.completions.filter((c) => c.choreKey === choreKey));
  const recordCompletion = useAppStore((s) => s.recordCompletion);

  const [step, setStep] = useState<Step>('pick');
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string | undefined>();
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [bonusXP, setBonusXP] = useState<number | undefined>();

  const selectedTarget = targets.find((t) => t.id === selectedTargetId);

  // Questions that are NOT pre-filled by the selected target
  const unfilledQuestions = selectedTarget
    ? questions.filter((q) => !selectedTarget.answers.some((a) => a.questionId === q.id && a.value !== null))
    : [];

  function handleChange(questionId: string, value: string | number | boolean | null) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (errors[questionId]) setErrors((prev) => { const next = { ...prev }; delete next[questionId]; return next; });
  }

  async function submitCompletion() {
    if (!selectedTarget) return;
    setSubmitting(true);
    try {
      // Merge pre-filled answers with user-entered answers
      const mergedAnswers: Answer[] = [
        ...selectedTarget.answers,
        ...unfilledQuestions.map((q) => ({ questionId: q.id, value: answers[q.id] ?? null })),
      ];
      const result = await recordCompletion(choreKey, mergedAnswers, selectedTargetId);
      if (result.setCompletionBonus !== undefined) {
        setBonusXP(result.setCompletionBonus);
        setStep('celebrate');
      } else {
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete() {
    if (!selectedTarget) return;
    if (unfilledQuestions.length > 0) {
      // Validate unfilled answers before proceeding
      const newErrors: Record<string, string> = {};
      for (const q of unfilledQuestions) {
        const answer: Answer = { questionId: q.id, value: answers[q.id] ?? null };
        const err = validateAnswer(answer, q);
        if (err) newErrors[q.id] = err;
      }
      if (Object.keys(newErrors).length > 0 && step === 'answer') {
        setErrors(newErrors);
        return;
      }
      if (step === 'pick') {
        setStep('answer');
        return;
      }
    }
    await submitCompletion();
  }

  const title = step === 'pick' ? 'Complete Target' : step === 'answer' ? 'Fill in Answers' : 'Set Complete!';

  return (
    <Dialog open onOpenChange={(open) => { if (!open && step !== 'celebrate') onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {step === 'pick' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">Select a target to complete.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShowCompleted((v) => !v)}
                >
                  {showCompleted ? 'Hide completed' : 'Show completed'}
                </Button>
              </div>
              <TargetsTable
                targets={targets}
                completions={completions}
                questions={questions}
                showCompleted={showCompleted}
                interactive
                selectedTargetId={selectedTargetId}
                onSelect={setSelectedTargetId}
              />
            </div>
          )}

          {step === 'answer' && (
            <div className="space-y-4 pt-1">
              <p className="text-sm text-muted-foreground">Fill in the remaining answers for this completion.</p>
              <AnswerForm
                questions={unfilledQuestions}
                answers={answers}
                errors={errors}
                onChange={handleChange}
              />
            </div>
          )}

          {step === 'celebrate' && (
            <CelebrationStep bonusXP={bonusXP} totalTargets={targets.length} onClose={onClose} />
          )}
        </div>

        <DialogFooter className="border-t pt-4 mt-4 sticky bottom-0 bg-background">
          {step === 'pick' && (
            <>
              <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
              <Button
                type="button"
                disabled={!selectedTargetId || submitting}
                onClick={handleComplete}
                className="bg-green-600 hover:bg-green-700 text-white disabled:bg-green-600 disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Complete'}
              </Button>
            </>
          )}
          {step === 'answer' && (
            <>
              <Button variant="outline" type="button" onClick={() => setStep('pick')}>← Back</Button>
              <Button
                type="button"
                disabled={submitting}
                onClick={handleComplete}
                className="bg-green-600 hover:bg-green-700 text-white disabled:bg-green-600 disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Complete'}
              </Button>
            </>
          )}
          {step === 'celebrate' && (
            <Button type="button" onClick={onClose} className="w-full">Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Update `src/components/chores/CompleteButton.tsx` to route to `TargetPickerModal`**

Read the current `CompleteButton.tsx` first (run `codegraph_explore "CompleteButton"` if needed), then add:

1. Import `TargetPickerModal`
2. Read `targets` from store
3. Determine `hasTargets`
4. Add state for showing `TargetPickerModal`
5. Conditionally render `TargetPickerModal` instead of `CompletionModal`

The key changes:
```tsx
import TargetPickerModal from './TargetPickerModal';

// Inside the component:
const targets = useAppStore((s) => s.targets);
const hasTargets = targets.some((t) => t.choreKey === chore.key);

// In the button click handler, open TargetPickerModal if hasTargets
// Render: hasTargets ? <TargetPickerModal ... /> : <CompletionModal ... />
```

Look at the existing component's modal state pattern and mirror it for `TargetPickerModal`.

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/components/chores/TargetPickerModal.tsx src/components/chores/CompleteButton.tsx package.json bun.lockb
git commit -m "feat(targets): TargetPickerModal with 3-step flow and celebration"
```

---

## Task 8: `TargetBuilder` and `ChoreFormModal` Targets section

**Files:**
- Create: `src/components/chores/TargetBuilder.tsx`
- Modify: `src/components/chores/ChoreFormModal.tsx`

- [ ] **Step 1: Create `src/components/chores/TargetBuilder.tsx`**

```tsx
import { useState } from 'react';
import type { Question, Completion, XPSize } from '@/types';
import type { DraftTarget } from '@/store';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { XP_BASE } from '@/xp/calculator';
import TargetFormModal from './TargetFormModal';
import { getAnswerDisplay } from '@/questions/display';

const XP_SIZES: XPSize[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

interface Props {
  questions: Question[];
  existingCompletions: Completion[]; // all completions for this chore (to offer as import suggestions)
  drafts: DraftTarget[];
  bonusEnabled: boolean;
  bonusXPSize: XPSize | 'CUSTOM';
  choreXPSize: XPSize | 'CUSTOM'; // default for bonus when user opts in
  onChange: (drafts: DraftTarget[]) => void;
  onBonusEnabledChange: (enabled: boolean) => void;
  onBonusXPSizeChange: (size: XPSize | 'CUSTOM') => void;
}

export default function TargetBuilder({
  questions, existingCompletions, drafts, bonusEnabled, bonusXPSize, choreXPSize,
  onChange, onBonusEnabledChange, onBonusXPSizeChange,
}: Props) {
  const [editingDraft, setEditingDraft] = useState<DraftTarget | 'new' | null>(null);

  const activeDrafts = drafts.filter((d) => !d._deleted);
  const deletedDrafts = drafts.filter((d) => d._deleted);

  // Unlinked completions: those without a targetId and not linked by a draft
  const linkedCompletionIds = new Set(activeDrafts.map((d) => d.linkedCompletionId).filter(Boolean));
  const unlinkedCompletions = existingCompletions.filter(
    (c) => !c.targetId && !linkedCompletionIds.has(c.id),
  );

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

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...activeDrafts];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    const reordered = next.map((d, i) => ({ ...d, order: i }));
    onChange([...reordered, ...deletedDrafts]);
  }

  function moveDown(idx: number) {
    if (idx === activeDrafts.length - 1) return;
    const next = [...activeDrafts];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    const reordered = next.map((d, i) => ({ ...d, order: i }));
    onChange([...reordered, ...deletedDrafts]);
  }

  function summarise(draft: DraftTarget): string {
    return questions
      .map((q) => {
        const ans = draft.answers.find((a) => a.questionId === q.id);
        if (!ans) return null;
        return getAnswerDisplay([ans], q);
      })
      .filter(Boolean)
      .join(', ') || '(empty)';
  }

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
            if (e.target.checked) onBonusXPSizeChange(choreXPSize);
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
                <SelectItem key={size} value={size}>{size} ({XP_BASE[size]} XP)</SelectItem>
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
        {activeDrafts.map((draft, idx) => (
          <div key={draft.id} className="flex items-center gap-2 rounded border border-border px-2 py-1 text-sm">
            <div className="flex flex-col">
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => moveUp(idx)} aria-label="Move up">↑</button>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => moveDown(idx)} aria-label="Move down">↓</button>
            </div>
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
          questions={questions}
          unlinkdedCompletions={editingDraft === 'new' ? unlinkedCompletions : []}
          initialDraft={editingDraft === 'new' ? undefined : editingDraft}
          choreKey=""
          onSave={handleSave}
          onClose={() => setEditingDraft(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add `TargetBuilder` to `ChoreFormModal`**

Read `src/components/chores/ChoreFormModal.tsx` in full — it was returned by codegraph. Apply these changes:

**a) Add imports:**
```typescript
import TargetBuilder from './TargetBuilder';
import type { DraftTarget } from '@/store';
import { getAllTargets } from '@/db';
```

**b) Add state for targets (after `questionDrafts` state):**
```typescript
const allTargets = useAppStore((s) => s.targets);
const initialTargets = choreKey ? allTargets.filter((t) => t.choreKey === choreKey) : [];
const [targetDrafts, setTargetDrafts] = useState<DraftTarget[]>(() =>
  initialTargets.map((t) => ({ ...t })),
);
const [bonusEnabled, setBonusEnabled] = useState(!!chore?.completionBonusXPSize);
const [bonusXPSize, setBonusXPSize] = useState<XPSize | 'CUSTOM'>(
  typeof chore?.completionBonusXPSize === 'number' ? 'CUSTOM' :
  (chore?.completionBonusXPSize as XPSize | undefined) ?? (typeof initialXpSize === 'number' ? 'CUSTOM' : initialXpSize as XPSize),
);

const hasTargets = targetDrafts.some((d) => !d._deleted);
const hasQuickAnswerSets = choreQuickSets.length > 0;
```

**c) Add `saveTargets` to the store import:**
```typescript
const saveTargets = useAppStore((s) => s.saveTargets);
```

**d) Save targets in `handleSubmit` after `saveQuestions`:**
```typescript
const completionBonusXPSize = bonusEnabled ? (bonusXPSize === 'CUSTOM' ? undefined : bonusXPSize as XPSize) : undefined;
// Pass completionBonusXPSize when calling updateChore/addChore
// (add it to the chore object spread in both branches)
await saveTargets(activeChoreKey, targetDrafts.map((d) => ({ ...d, choreKey: activeChoreKey })));
```

Also add `completionBonusXPSize` to both `updateChore` and `addChore` calls.

**e) Add `TargetBuilder` section after the Questions section:**

Only show when the chore has at least one question (any type):
```tsx
{questionDrafts.filter((d) => !d._deleted).length > 0 && (
  <div>
    <div className="mb-2 flex items-center gap-2">
      <h3 className="text-sm font-semibold">Targets</h3>
      <span className="text-xs text-muted-foreground">
        {hasTargets ? `${targetDrafts.filter((d) => !d._deleted).length} target(s)` : 'None'}
      </span>
    </div>
    {hasQuickAnswerSets && !hasTargets && (
      <p className="text-xs text-muted-foreground mb-2">Not available when quick answer sets are defined.</p>
    )}
    {!hasQuickAnswerSets && (
      <TargetBuilder
        questions={questionDrafts.filter((d) => !d._deleted) as Question[]}
        existingCompletions={isEdit ? allCompletions.filter((c) => c.choreKey === choreKey) : []}
        drafts={targetDrafts}
        bonusEnabled={bonusEnabled}
        bonusXPSize={bonusXPSize}
        choreXPSize={xpSize}
        onChange={setTargetDrafts}
        onBonusEnabledChange={setBonusEnabled}
        onBonusXPSizeChange={setBonusXPSize}
      />
    )}
    {hasTargets && hasQuickAnswerSets && (
      <p className="text-xs text-muted-foreground mb-2">Quick answer sets are hidden while targets are defined.</p>
    )}
  </div>
)}
```

Add `allCompletions` to store reads at the top of the component:
```typescript
const allCompletions = useAppStore((s) => s.completions);
```

For the Quick Answer Sets section, wrap it with `{!hasTargets && (...)}`.

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Fix any type errors — the `XP_BASE` import may need checking; it's already imported in `ChoreFormModal`.

- [ ] **Step 4: Commit**

```bash
git add src/components/chores/TargetBuilder.tsx src/components/chores/ChoreFormModal.tsx
git commit -m "feat(targets): TargetBuilder and ChoreFormModal Targets section"
```

---

## Task 9: `ChoreCard` target progress bar

**Files:**
- Modify: `src/components/dashboard/ChoreCard.tsx`

- [ ] **Step 1: Add target progress bar to `ChoreCard`**

Read the current `ChoreCard.tsx` — it was returned by codegraph. Apply these changes:

**a) Add targets to store reads at the top of the component:**
```tsx
const targets = useAppStore((s) => s.targets.filter((t) => t.choreKey === chore.key));
```

**b) Compute progress:**
```tsx
const totalTargets = targets.length;
const doneTargets = targets.filter((t) =>
  choreCompletions.some((c) => c.targetId === t.id),
).length;
const targetProgress = totalTargets > 0 ? doneTargets / totalTargets : null;
const allTargetsDone = totalTargets > 0 && doneTargets === totalTargets;
```

**c) Add progress bar in `CardContent` after the XP/streak/recurrence row and before `QuickCompleteButtonList`:**

```tsx
{targetProgress !== null && (
  <div className="mt-2 space-y-1">
    {!compact && (
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Target progress</span>
        {allTargetsDone
          ? <span className="rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-green-800 dark:text-green-300 font-medium">Completed</span>
          : <span>{doneTargets} / {totalTargets}</span>
        }
      </div>
    )}
    <div
      className="h-2 w-full rounded-full bg-muted overflow-hidden"
      title={compact ? `${doneTargets} / ${totalTargets} targets` : undefined}
    >
      <div
        className="h-full rounded-full bg-green-500 transition-all"
        style={{ width: `${Math.round(targetProgress * 100)}%` }}
      />
    </div>
  </div>
)}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/ChoreCard.tsx
git commit -m "feat(targets): target progress bar on ChoreCard"
```

---

## Task 10: `ChorePage` unified table with targets toggle

**Files:**
- Modify: `src/components/chores/ChorePage.tsx`

`ChorePage` currently renders an inline table. We need to replace it with a unified view showing both completions and pending targets (targets hidden by default).

- [ ] **Step 1: Update `src/components/chores/ChorePage.tsx`**

Read the current `ChorePage.tsx` — it was returned by codegraph. Replace the component with this updated version:

```tsx
import { useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import { getAnswerDisplay } from '@/questions/display';
import { Button } from '@/components/ui/button';
import { MarkdownDisplay } from '@/components/ui/MarkdownDisplay';

type SortDir = 'asc' | 'desc';
type SortKey = 'completedAt' | `question:${string}` | 'xpEarned';
interface SortEntry { key: SortKey; dir: SortDir; }

// A unified row is either a completion or a pending target
interface UnifiedRow {
  kind: 'completion' | 'target';
  id: string;
  completedAt: string | null;
  answers: Array<{ questionId: string; value: string | number | boolean | null }>;
  xpEarned: number | null;
}

export default function ChorePage() {
  const { encodedChoreKey } = useParams<{ encodedChoreKey: string }>();
  const navigate = useNavigate();

  const choreKey = encodedChoreKey ? decodeURIComponent(encodedChoreKey) : '';
  const chores = useAppStore((s) => s.chores);
  const allCompletions = useAppStore((s) => s.completions);
  const questions = useAppStore((s) => s.questions);
  const allTargets = useAppStore((s) => s.targets);

  const chore = chores.find((c) => c.key === choreKey);
  if (!chore) return <Navigate to="/" replace />;

  const choreQuestions = questions
    .filter((q) => q.choreKey === choreKey)
    .sort((a, b) => a.order - b.order);

  const completions = allCompletions.filter((c) => c.choreKey === choreKey);
  const targets = allTargets.filter((t) => t.choreKey === choreKey);
  const hasTargets = targets.length > 0;

  // Pending targets: those without any linked completion
  const pendingTargets = targets.filter((t) => !completions.some((c) => c.targetId === t.id));

  const [showTargets, setShowTargets] = useState(false);
  const [sorts, setSorts] = useState<SortEntry[]>([{ key: 'completedAt', dir: 'desc' }]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  // Build unified rows
  const completionRows: UnifiedRow[] = completions.map((c) => ({
    kind: 'completion',
    id: c.id,
    completedAt: c.completedAt,
    answers: c.answers,
    xpEarned: c.xpEarned,
  }));

  const targetRows: UnifiedRow[] = showTargets ? pendingTargets.map((t) => ({
    kind: 'target',
    id: t.id,
    completedAt: null,
    answers: t.answers,
    xpEarned: null,
  })) : [];

  const allRows = [...completionRows, ...targetRows];

  // Sort
  function getAnswerVal(row: UnifiedRow, questionId: string): string | number | boolean | null {
    return row.answers.find((a) => a.questionId === questionId)?.value ?? null;
  }

  function compareValues(a: unknown, b: unknown): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
  }

  const sorted = [...allRows].sort((a, b) => {
    for (const sort of sorts) {
      let result = 0;
      if (sort.key === 'completedAt') result = compareValues(a.completedAt, b.completedAt);
      else if (sort.key === 'xpEarned') result = compareValues(a.xpEarned, b.xpEarned);
      else {
        const qId = sort.key.slice('question:'.length);
        result = compareValues(getAnswerVal(a, qId), getAnswerVal(b, qId));
      }
      if (result !== 0) return sort.dir === 'asc' ? result : -result;
    }
    return 0;
  });

  function clickHeader(key: SortKey) {
    setSorts((prev) => {
      const existing = prev.find((s) => s.key === key);
      if (!existing) return [...prev, { key, dir: 'asc' }];
      if (existing.dir === 'asc') return prev.map((s) => s.key === key ? { ...s, dir: 'desc' } : s);
      return prev.filter((s) => s.key !== key);
    });
  }

  function SortLabel({ colKey }: { colKey: SortKey }) {
    const idx = sorts.findIndex((s) => s.key === colKey);
    if (idx === -1) return <span className="ml-1 text-muted-foreground/40 text-xs">↕</span>;
    return <span className="ml-1 text-xs">{sorts[idx].dir === 'asc' ? '↑' : '↓'}<sup>{idx + 1}</sup></span>;
  }

  const hasSorts = sorts.length > 0;

  return (
    <div className="py-4">
      <Button variant="link" onClick={() => navigate(-1)} className="mb-4 px-0">← Back</Button>
      <h1 className="mb-2 text-2xl font-bold text-foreground">{chore.title}</h1>
      {chore.description && (
        <MarkdownDisplay key={chore.description} content={chore.description} className="mb-4 text-sm text-muted-foreground" />
      )}

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-foreground">Completion History</h2>
        {hasTargets && pendingTargets.length > 0 && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowTargets((v) => !v)}>
            {showTargets ? 'Hide targets' : `Show targets (${pendingTargets.length} pending)`}
          </Button>
        )}
      </div>

      {allRows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No completions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th
                  className="py-2 pr-4 font-medium text-foreground whitespace-nowrap cursor-pointer select-none"
                  onClick={() => clickHeader('completedAt')}
                >
                  Completed at <SortLabel colKey="completedAt" />
                </th>
                {choreQuestions.map((q) => (
                  <th
                    key={q.id}
                    className="py-2 pr-4 font-medium text-foreground cursor-pointer select-none"
                    onClick={() => clickHeader(`question:${q.id}`)}
                  >
                    {q.prompt} <SortLabel colKey={`question:${q.id}`} />
                  </th>
                ))}
                <th
                  className="py-2 font-medium text-foreground text-right cursor-pointer select-none"
                  onClick={() => clickHeader('xpEarned')}
                >
                  XP earned <SortLabel colKey="xpEarned" />
                </th>
                <th className="py-2 pl-4 font-normal">
                  <button
                    className={`text-xs text-muted-foreground hover:text-foreground underline${!hasSorts ? ' invisible' : ''}`}
                    onClick={() => setSorts([])}
                    tabIndex={hasSorts ? undefined : -1}
                    aria-hidden={!hasSorts || undefined}
                  >
                    Reset sorting
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const isPending = row.kind === 'target';
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-border ${isPending ? 'opacity-40' : 'hover:bg-muted'}`}
                  >
                    <th scope="row" className="py-2 pr-4 text-muted-foreground whitespace-nowrap font-normal">
                      {row.completedAt ? formatDate(row.completedAt) : '—'}
                    </th>
                    {choreQuestions.map((q) => (
                      <td key={q.id} className="py-2 pr-4 text-muted-foreground">
                        {getAnswerDisplay(row.answers as Array<{ questionId: string; value: string | number | boolean | null }> as any, q)}
                      </td>
                    ))}
                    <td className="py-2 text-foreground font-medium text-right">
                      {row.xpEarned !== null ? row.xpEarned : '—'}
                    </td>
                    <td />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

Note: `getAnswerDisplay` expects `Answer[]` — cast the unified row's answers to `Answer[]` for the call. Check if a direct cast works or if you need to adjust the type.

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Fix the `getAnswerDisplay` call if the cast causes errors — replace `as any` with a proper typed cast:
```tsx
{getAnswerDisplay(row.answers as import('@/types').Answer[], q)}
```

Or import `Answer` and use `row.answers as Answer[]`.

- [ ] **Step 3: Run all tests**

```bash
bun run test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/chores/ChorePage.tsx
git commit -m "feat(targets): unified Completion History + pending targets on ChorePage"
```

---

## Self-Review

### Spec coverage

- §1 Data model: Types, DB, Zod ✅ Task 1
- §2 Target definition UI, mutual exclusivity, TargetFormModal: ✅ Tasks 6, 8
- §3 AnswerForm extraction, TargetsTable, TargetPickerModal, set-completion bonus, CompleteButton routing: ✅ Tasks 4, 5, 7
- §4 ChoreCard progress bar: ✅ Task 9
- §5 ChorePage unified table: ✅ Task 10
- §6 Migration (import from history in TargetFormModal): ✅ Task 6 (Step 1 of TargetFormModal)
- §7 Store, DB helpers, exportAppState: ✅ Tasks 2, 3
- §8 canvas-confetti, trophy.svg: ✅ Task 7

### Placeholder scan

- Task 7 Step 3 (`CompleteButton`) says to mirror the existing modal state pattern — the existing component opens `CompletionModal` via a state flag; do the same for `TargetPickerModal`.
- Task 8 Step 2 references `allCompletions` — verify this is passed correctly to `TargetBuilder` (`existingCompletions` prop).
- Task 10 uses `as any` cast for `getAnswerDisplay` — resolve with explicit `Answer[]` cast.

### Type consistency

- `DraftTarget` exported from `src/store/index.ts` — used in `TargetBuilder`, `TargetFormModal`, `ChoreFormModal`. ✅
- `recordCompletion` returns `Promise<{ setCompletionBonus?: number }>` — consumed in `TargetPickerModal`. ✅
- `TargetsTable` exports `filterAndSortTargets`, `isTargetDone`, `getTargetCompletedAt` — used in test file. ✅
- `SortEntry` exported from `TargetsTable.tsx` — not consumed outside, no issue.
