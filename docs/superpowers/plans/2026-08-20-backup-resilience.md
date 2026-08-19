# Backup Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two sync bugs (targets not imported, encrypted backup broken for PQ users) and add a configurable in-app backup reminder banner.

**Architecture:** Four isolated changes land in sequence: bug fixes to `src/sync/import.ts` and `src/sync/export.ts`, a shared export utility in `src/backup/doExport.ts`, a pure-logic hook `src/hooks/useBackupReminder.ts`, a banner component `src/components/backup/BackupReminderBanner.tsx`, and wiring changes to `ProfilePage` and `Dashboard`.

**Tech Stack:** TypeScript, React, `bun:test`, `fake-indexeddb` (already a dev dependency — used in `src/db/targets.test.ts`), Tailwind CSS.

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/sync/import.ts` | Add `targets` to `importAppState`; fix `decryptedImport` for PQ |
| Create | `src/sync/import.test.ts` | Tests for `importAppState` targets and `decryptedImport` round-trip |
| Modify | `src/sync/export.ts` | Fix `encryptedExport` for PQ credentials |
| Create | `src/sync/export.test.ts` | Round-trip test for PQ encrypted export |
| Create | `src/backup/doExport.ts` | Shared browser-download helper (reads format from localStorage) |
| Create | `src/hooks/useBackupReminder.ts` | `computeIsDue` pure fn + React hook for reminder state |
| Create | `src/hooks/useBackupReminder.test.ts` | Unit tests for `computeIsDue` |
| Create | `src/components/backup/BackupReminderBanner.tsx` | Dismissible banner with Export / Remind me later / × |
| Modify | `src/components/profile/ProfilePage.tsx` | Use hook + `doExport`; add frequency selector |
| Modify | `src/components/dashboard/Dashboard.tsx` | Mount `BackupReminderBanner` at top |

---

## Task 1: Fix `importAppState` — add `targets`

**Files:**
- Create: `src/sync/import.test.ts`
- Modify: `src/sync/import.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/sync/import.test.ts`:

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'bun:test';
import { openDB } from '@/db/index';
import { importAppState } from './import';
import { getAllTargets, putTarget } from '@/db';
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import type { AppState, Target } from '@/types';

let db: IDBPDatabase<TasksHarmonyDB>;

const minimalState: AppState = {
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  packs: [{ id: 'personal', manifest: { title: 'My Chores' }, isPersonal: true, importedAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }],
  chores: [],
  questions: [],
  completions: [],
  xpSettings: [{ id: 'standard', name: 'Standard', maxStreakMultiplier: 2.5, decayFloor: 0.6, streakHalfLife: 7, decayHalfLife: 56 }],
  quickAnswerSets: [],
  targets: [],
  profile: { id: 'me', displayName: '', email: '', activeXPSettingsId: 'standard' },
  syncState: { id: 'main', pendingSync: false },
};

beforeEach(async () => {
  db = await openDB('test-import-' + crypto.randomUUID());
});

describe('importAppState — targets', () => {
  it('imports targets from state', async () => {
    const target: Target = { id: 't1', choreKey: 'personal/chore', order: 0, answers: [] };
    await importAppState(db, { ...minimalState, targets: [target] });
    expect(await getAllTargets(db)).toContainEqual(target);
  });

  it('clears existing targets before importing', async () => {
    await putTarget(db, { id: 'old', choreKey: 'personal/chore', order: 0, answers: [] });
    await importAppState(db, minimalState);
    expect(await getAllTargets(db)).toHaveLength(0);
  });

  it('imports multiple targets', async () => {
    const targets: Target[] = [
      { id: 'a', choreKey: 'personal/c', order: 0, answers: [] },
      { id: 'b', choreKey: 'personal/c', order: 1, answers: [] },
    ];
    await importAppState(db, { ...minimalState, targets });
    expect(await getAllTargets(db)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun test --isolate src/sync/import.test.ts
```

Expected: FAIL — `targets` are not cleared or imported by the current implementation.

- [ ] **Step 3: Fix `importAppState` in `src/sync/import.ts`**

Replace the existing `importAppState` function (leave `decryptedImport` unchanged for now):

```typescript
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import type { AppState } from '@/types';
import { getOrCreateSyncKey } from '@/sync/credentials';
import { decryptState } from '@/sync/encrypt';

export async function importAppState(db: IDBPDatabase<TasksHarmonyDB>, state: AppState): Promise<void> {
  const storeNames = [
    'packs', 'chores', 'questions', 'completions',
    'xpSettings', 'profile', 'syncState', 'quickAnswerSets', 'targets',
  ] as const;
  const tx = db.transaction(storeNames, 'readwrite');

  await Promise.all(storeNames.map((name) => tx.objectStore(name).clear()));

  await Promise.all([
    ...state.packs.map((p) => tx.objectStore('packs').put(p)),
    ...state.chores.map((c) => tx.objectStore('chores').put(c)),
    ...state.questions.map((q) => tx.objectStore('questions').put(q)),
    ...state.completions.map((c) => tx.objectStore('completions').put(c)),
    ...state.xpSettings.map((s) => tx.objectStore('xpSettings').put(s)),
    ...(state.quickAnswerSets ?? []).map((q) => tx.objectStore('quickAnswerSets').put(q)),
    ...(state.targets ?? []).map((t) => tx.objectStore('targets').put(t)),
    tx.objectStore('profile').put(state.profile),
    tx.objectStore('syncState').put(state.syncState),
  ]);

  await tx.done;
}

export async function decryptedImport(
  db: IDBPDatabase<TasksHarmonyDB>,
  blob: Uint8Array,
): Promise<AppState> {
  const key = await getOrCreateSyncKey(db);
  return decryptState(key, blob);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
bun test --isolate src/sync/import.test.ts
```

Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/sync/import.ts src/sync/import.test.ts
git commit -m "fix(sync): include targets store in importAppState

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Fix encrypted backup for PQ users

**Files:**
- Create: `src/sync/export.test.ts`
- Modify: `src/sync/export.ts`
- Modify: `src/sync/import.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/sync/export.test.ts`:

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'bun:test';
import { openDB } from '@/db/index';
import { putCredentials } from '@/db';
import { generatePQCredentials } from '@/sync/credentials';
import { encryptedExport } from './export';
import { decryptedImport } from './import';
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';

let db: IDBPDatabase<TasksHarmonyDB>;

beforeEach(async () => {
  db = await openDB('test-export-' + crypto.randomUUID());
});

describe('encryptedExport + decryptedImport — PQ credentials', () => {
  it('produces a blob with PQ version byte 0x02', async () => {
    const creds = await generatePQCredentials();
    await putCredentials(db, creds);
    const blob = await encryptedExport(db);
    expect(blob[0]).toBe(0x02);
  });

  it('round-trips app state through PQ encrypted backup', async () => {
    const creds = await generatePQCredentials();
    await putCredentials(db, creds);
    const blob = await encryptedExport(db);
    const state = await decryptedImport(db, blob);
    expect(state.profile.id).toBe('me');
    expect(state.syncState.id).toBe('main');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun test --isolate src/sync/export.test.ts
```

Expected: FAIL — `encryptedExport` throws `'Cannot use legacy sync key functions with PQ credentials'`.

- [ ] **Step 3: Fix `encryptedExport` in `src/sync/export.ts`**

Replace the file content:

```typescript
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import {
  getPacks, getAllChores, getAllQuestions, getAllCompletions,
  getXPSettings, getProfile, getSyncState, getAllQuickAnswerSets, getAllTargets,
  getCredentials,
} from '@/db/index';
import type { AppState } from '@/types';
import { isLegacyCredentials, getOrCreateSyncKey } from '@/sync/credentials';
import { encryptState, encryptStatePQ } from '@/sync/encrypt';

export async function exportAppState(db: IDBPDatabase<TasksHarmonyDB>): Promise<AppState> {
  const [packs, chores, questions, completions, xpSettings, profile, syncState, quickAnswerSets, targets] =
    await Promise.all([
      getPacks(db), getAllChores(db), getAllQuestions(db), getAllCompletions(db),
      getXPSettings(db), getProfile(db), getSyncState(db), getAllQuickAnswerSets(db), getAllTargets(db),
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

export async function encryptedExport(db: IDBPDatabase<TasksHarmonyDB>): Promise<Uint8Array> {
  const creds = await getCredentials(db);
  if (!creds) throw new Error('No sync credentials found. Cannot create encrypted backup.');
  const state = await exportAppState(db);
  if (isLegacyCredentials(creds)) {
    return encryptState(creds.cryptoKey, state);
  }
  return encryptStatePQ(creds, state);
}
```

- [ ] **Step 4: Fix `decryptedImport` in `src/sync/import.ts`**

Replace the `decryptedImport` function (keep `importAppState` from Task 1 intact):

```typescript
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import type { AppState } from '@/types';
import { isLegacyCredentials } from '@/sync/credentials';
import { decryptState, decryptStatePQ } from '@/sync/encrypt';
import { getCredentials } from '@/db';

export async function importAppState(db: IDBPDatabase<TasksHarmonyDB>, state: AppState): Promise<void> {
  const storeNames = [
    'packs', 'chores', 'questions', 'completions',
    'xpSettings', 'profile', 'syncState', 'quickAnswerSets', 'targets',
  ] as const;
  const tx = db.transaction(storeNames, 'readwrite');

  await Promise.all(storeNames.map((name) => tx.objectStore(name).clear()));

  await Promise.all([
    ...state.packs.map((p) => tx.objectStore('packs').put(p)),
    ...state.chores.map((c) => tx.objectStore('chores').put(c)),
    ...state.questions.map((q) => tx.objectStore('questions').put(q)),
    ...state.completions.map((c) => tx.objectStore('completions').put(c)),
    ...state.xpSettings.map((s) => tx.objectStore('xpSettings').put(s)),
    ...(state.quickAnswerSets ?? []).map((q) => tx.objectStore('quickAnswerSets').put(q)),
    ...(state.targets ?? []).map((t) => tx.objectStore('targets').put(t)),
    tx.objectStore('profile').put(state.profile),
    tx.objectStore('syncState').put(state.syncState),
  ]);

  await tx.done;
}

export async function decryptedImport(
  db: IDBPDatabase<TasksHarmonyDB>,
  blob: Uint8Array,
): Promise<AppState> {
  const creds = await getCredentials(db);
  if (!creds) throw new Error('No sync credentials found. Cannot decrypt backup.');
  if (isLegacyCredentials(creds)) {
    return decryptState(creds.cryptoKey, blob);
  }
  return decryptStatePQ(creds, blob);
}
```

- [ ] **Step 5: Run all sync tests**

```bash
bun test --isolate src/sync/
```

Expected: PASS — both new test files and existing encrypt/credentials/migrate tests all green.

- [ ] **Step 6: Commit**

```bash
git add src/sync/export.ts src/sync/import.ts src/sync/export.test.ts
git commit -m "fix(backup): restore encrypted backup for PQ users

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Create `src/backup/doExport.ts`

**Files:**
- Create: `src/backup/doExport.ts`

This function triggers a browser download. It is not unit-tested (depends on `URL.createObjectURL`); it is covered end-to-end when the banner and ProfilePage are exercised manually.

- [ ] **Step 1: Create `src/backup/doExport.ts`**

```typescript
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import { encryptedExport, exportAppState } from '@/sync/export';
import { wrapStateInZip, buildBackupFilename } from '@/backup/backup';

export async function doExport(db: IDBPDatabase<TasksHarmonyDB>): Promise<void> {
  const format = localStorage.getItem('backup-export-format') ?? 'encrypted';
  const date = new Date().toISOString().substring(0, 10);

  let file: Blob;
  let filename: string;

  if (format === 'encrypted') {
    const blob = await encryptedExport(db);
    file = new Blob([blob.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    filename = `tasks-harmony-backup-${date}.enc`;
  } else {
    const state = await exportAppState(db);
    const zipBytes = wrapStateInZip(state);
    file = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
    filename = buildBackupFilename(date);
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/backup/doExport.ts
git commit -m "feat(backup): add shared doExport utility

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Create `useBackupReminder` hook

**Files:**
- Create: `src/hooks/useBackupReminder.ts`
- Create: `src/hooks/useBackupReminder.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useBackupReminder.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { computeIsDue } from './useBackupReminder';

function isoHoursAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 60 * 1000).toISOString();
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe('computeIsDue', () => {
  it('is due when no prior action, daily', () => {
    expect(computeIsDue('daily', null, null)).toBe(true);
  });

  it('is due when no prior action, weekly', () => {
    expect(computeIsDue('weekly', null, null)).toBe(true);
  });

  it('is never due when frequency is never', () => {
    expect(computeIsDue('never', null, null)).toBe(false);
    expect(computeIsDue('never', isoDaysAgo(100), isoDaysAgo(100))).toBe(false);
  });

  it('is not due when dismissed 1 hour ago, daily', () => {
    expect(computeIsDue('daily', null, isoHoursAgo(1))).toBe(false);
  });

  it('is due when dismissed 25 hours ago, daily', () => {
    expect(computeIsDue('daily', null, isoDaysAgo(2))).toBe(true);
  });

  it('is not due when backed up 1 hour ago, daily', () => {
    expect(computeIsDue('daily', isoHoursAgo(1), null)).toBe(false);
  });

  it('uses the more recent of lastBackedUpAt and dismissedAt', () => {
    // dismissed 1h ago (recent), backed up 10 days ago (old) → not due
    expect(computeIsDue('daily', isoDaysAgo(10), isoHoursAgo(1))).toBe(false);
  });

  it('is not due when dismissed 5 days ago, weekly', () => {
    expect(computeIsDue('weekly', null, isoDaysAgo(5))).toBe(false);
  });

  it('is due when dismissed 8 days ago, weekly', () => {
    expect(computeIsDue('weekly', null, isoDaysAgo(8))).toBe(true);
  });

  it('is not due when dismissed 25 days ago, monthly', () => {
    expect(computeIsDue('monthly', null, isoDaysAgo(25))).toBe(false);
  });

  it('is due when dismissed 31 days ago, monthly', () => {
    expect(computeIsDue('monthly', null, isoDaysAgo(31))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun test --isolate src/hooks/useBackupReminder.test.ts
```

Expected: FAIL — `computeIsDue` does not exist yet.

- [ ] **Step 3: Create `src/hooks/useBackupReminder.ts`**

```typescript
import { useState } from 'react';

export type BackupReminderFrequency = 'never' | 'daily' | 'weekly' | 'monthly';

const KEYS = {
  frequency: 'backup-reminder-frequency',
  dismissedAt: 'backup-reminder-dismissed-at',
  lastBackedUpAt: 'last-backed-up-at',
  exportFormat: 'backup-export-format',
} as const;

const PERIOD_DAYS: Record<Exclude<BackupReminderFrequency, 'never'>, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

export function computeIsDue(
  frequency: BackupReminderFrequency,
  lastBackedUpAt: string | null,
  dismissedAt: string | null,
  now: Date = new Date(),
): boolean {
  if (frequency === 'never') return false;

  const epoch = new Date(0).toISOString();
  const a = lastBackedUpAt ?? epoch;
  const b = dismissedAt ?? epoch;
  const lastActionStr = a > b ? a : b;

  const d = new Date(lastActionStr);
  const lastMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nextDue = new Date(lastMidnight.getTime() + PERIOD_DAYS[frequency] * 24 * 60 * 60 * 1000);

  return now >= nextDue;
}

export interface UseBackupReminderReturn {
  isDue: boolean;
  frequency: BackupReminderFrequency;
  exportFormat: 'encrypted' | 'plain';
  setFrequency: (f: BackupReminderFrequency) => void;
  setExportFormat: (f: 'encrypted' | 'plain') => void;
  dismiss: () => void;
  recordExport: () => void;
}

export function useBackupReminder(): UseBackupReminderReturn {
  const [frequency, setFrequencyState] = useState<BackupReminderFrequency>(
    () => (localStorage.getItem(KEYS.frequency) as BackupReminderFrequency | null) ?? 'daily',
  );
  const [exportFormat, setExportFormatState] = useState<'encrypted' | 'plain'>(
    () => (localStorage.getItem(KEYS.exportFormat) as 'encrypted' | 'plain' | null) ?? 'encrypted',
  );
  const [isDue, setIsDue] = useState(() =>
    computeIsDue(
      (localStorage.getItem(KEYS.frequency) as BackupReminderFrequency | null) ?? 'daily',
      localStorage.getItem(KEYS.lastBackedUpAt),
      localStorage.getItem(KEYS.dismissedAt),
    ),
  );

  function setFrequency(f: BackupReminderFrequency) {
    localStorage.setItem(KEYS.frequency, f);
    setFrequencyState(f);
    setIsDue(computeIsDue(f, localStorage.getItem(KEYS.lastBackedUpAt), localStorage.getItem(KEYS.dismissedAt)));
  }

  function setExportFormat(f: 'encrypted' | 'plain') {
    localStorage.setItem(KEYS.exportFormat, f);
    setExportFormatState(f);
  }

  function dismiss() {
    const now = new Date().toISOString();
    localStorage.setItem(KEYS.dismissedAt, now);
    setIsDue(computeIsDue(frequency, localStorage.getItem(KEYS.lastBackedUpAt), now));
  }

  function recordExport() {
    const now = new Date().toISOString();
    localStorage.setItem(KEYS.lastBackedUpAt, now);
    setIsDue(computeIsDue(frequency, now, localStorage.getItem(KEYS.dismissedAt)));
  }

  return { isDue, frequency, exportFormat, setFrequency, setExportFormat, dismiss, recordExport };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
bun test --isolate src/hooks/useBackupReminder.test.ts
```

Expected: PASS — all 11 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBackupReminder.ts src/hooks/useBackupReminder.test.ts
git commit -m "feat(backup): add useBackupReminder hook with computeIsDue

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Create `BackupReminderBanner`

**Files:**
- Create: `src/components/backup/BackupReminderBanner.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react';
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import { useBackupReminder } from '@/hooks/useBackupReminder';
import { doExport } from '@/backup/doExport';

interface Props {
  db: IDBPDatabase<TasksHarmonyDB>;
}

export function BackupReminderBanner({ db }: Props) {
  const { isDue, dismiss, recordExport } = useBackupReminder();
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isDue || sessionDismissed) return null;

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      await doExport(db);
      recordExport();
    } catch {
      setError('Export failed. Try again or use the Profile page.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-md border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-sm text-amber-800 dark:text-amber-300 mb-4"
    >
      <span>{error ?? 'Time to back up your data.'}</span>
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={handleExport}
          disabled={loading}
          className="font-medium underline hover:no-underline disabled:opacity-50"
        >
          {loading ? 'Exporting…' : 'Export now'}
        </button>
        <button
          onClick={() => setSessionDismissed(true)}
          className="underline hover:no-underline"
        >
          Remind me later
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss reminder"
          className="hover:opacity-70 text-base leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/backup/BackupReminderBanner.tsx
git commit -m "feat(backup): add BackupReminderBanner component

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Update `ProfilePage`

**Files:**
- Modify: `src/components/profile/ProfilePage.tsx`

Replace the ephemeral `exportFormat` state with the hook, wire `doExport`, call `recordExport` on success, and add the frequency selector. The key import/export sections of the page are unchanged.

- [ ] **Step 1: Update imports at the top of `src/components/profile/ProfilePage.tsx`**

Remove:
```typescript
import { exportAppState, encryptedExport } from '@/sync/export';
import { wrapStateInZip, buildBackupFilename, unwrapStateFromZip, isAppStatePristine } from '@/backup/backup';
```

Add:
```typescript
import { unwrapStateFromZip, isAppStatePristine } from '@/backup/backup';
import { doExport } from '@/backup/doExport';
import { useBackupReminder } from '@/hooks/useBackupReminder';
```

- [ ] **Step 2: Replace `exportFormat` state and wire hook**

Remove this line:
```typescript
const [exportFormat, setExportFormat] = useState<'encrypted' | 'plain'>('encrypted');
```

Add after the other `useState` declarations (around line 48):
```typescript
const { frequency, setFrequency, exportFormat, setExportFormat, recordExport } = useBackupReminder();
```

- [ ] **Step 3: Replace `handleExport`**

Replace the existing `handleExport` function with:

```typescript
async function handleExport() {
  if (!db) return;
  setExportError(null);
  try {
    await doExport(db);
    recordExport();
  } catch {
    setExportError('Export failed. Please try again.');
  }
}
```

- [ ] **Step 4: Add the frequency selector to the Backup section**

In the Backup section (after the format radio buttons, before the Export Backup button), add:

```tsx
<div className="space-y-2">
  <span className="text-sm font-medium text-foreground">Remind me to back up</span>
  <div className="flex flex-wrap gap-2">
    {(['never', 'daily', 'weekly', 'monthly'] as const).map((f) => (
      <Button
        key={f}
        type="button"
        variant={frequency === f ? 'default' : 'outline'}
        size="sm"
        onClick={() => setFrequency(f)}
      >
        {f === 'daily' ? 'Daily (recommended)' : f.charAt(0).toUpperCase() + f.slice(1)}
      </Button>
    ))}
  </div>
</div>
```

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 6: Run full test suite**

```bash
bun test --isolate src/
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/profile/ProfilePage.tsx
git commit -m "feat(backup): wire reminder frequency and doExport into ProfilePage

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Mount banner in `Dashboard`

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx`

- [ ] **Step 1: Add import**

Add to the imports at the top of `src/components/dashboard/Dashboard.tsx`:

```typescript
import { BackupReminderBanner } from '@/components/backup/BackupReminderBanner';
```

- [ ] **Step 2: Read `db` from the store**

Add inside the `Dashboard` component body (after the existing `useAppStore` calls):

```typescript
const db = useAppStore((s) => s.db);
```

- [ ] **Step 3: Mount banner at top of return**

The return currently starts with:
```tsx
return (
  <div className="space-y-6 pb-8">
    <div className="flex items-center justify-between pt-4">
```

Add the banner immediately inside the outer div:
```tsx
return (
  <div className="space-y-6 pb-8">
    {db && <BackupReminderBanner db={db} />}
    <div className="flex items-center justify-between pt-4">
```

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
bun test --isolate src/
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/Dashboard.tsx
git commit -m "feat(backup): mount BackupReminderBanner in Dashboard

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
