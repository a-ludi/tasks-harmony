# Backup Resilience — Design Spec

## Context

A data loss incident exposed three gaps in Tasks Harmony's backup/sync story:

1. `importAppState` omits the `targets` store — targets are exported but never synced back on pull or import.
2. `encryptedExport` calls legacy AES-GCM key functions that throw for PQ credentials — the encrypted `.enc` backup format is silently broken for all users who completed the PQ migration.
3. There is no recurring reminder to back up. The sync key lives solely in IndexedDB; if the browser clears storage (as Brave on Android did), both the local data and the key are lost with no recovery path.

## Scope

Four changes, ordered by risk:

1. **Bug fix:** add `targets` to `importAppState`
2. **Bug fix:** update `encryptedExport`/`decryptedImport` to support PQ credentials
3. **UX fix:** persist the export format preference in `localStorage`
4. **Feature:** backup reminder banner with configurable frequency

---

## 1. Fix: `targets` in `importAppState`

**File:** `src/sync/import.ts`

Add `'targets'` to `storeNames` and include `state.targets` in the write pass. The object store already exists (added in DB_VERSION 5); no schema migration needed.

```typescript
const storeNames = [
  'packs', 'chores', 'questions', 'completions',
  'xpSettings', 'profile', 'syncState', 'quickAnswerSets', 'targets',
] as const;
// write pass:
...(state.targets ?? []).map((t) => tx.objectStore('targets').put(t)),
```

---

## 2. Fix: encrypted backup for PQ users

**Files:** `src/sync/export.ts`, `src/sync/import.ts`

`encryptedExport` currently calls `getOrCreateSyncKey(db)`, which throws for PQ credentials. Update it to branch on credential type:

- **Legacy credentials:** existing `encryptState(key, state)` path — no change.
- **PQ credentials:** `encryptStatePQ(creds, state)` — same function used for server sync.

`decryptedImport` mirrors this: detect which decryption to apply by attempting `decryptStatePQ` for PQ credentials and falling back to `decryptState` for legacy `.enc` files.

The `.enc` file format remains an opaque binary blob. Restoration requires the matching key (PQ or legacy) that was active when the backup was created.

---

## 3. UX fix: persist export format preference

**File:** `src/components/profile/ProfilePage.tsx`

Replace the ephemeral `exportFormat` useState (resets to `'encrypted'` on every visit) with a `localStorage`-backed value. Both the Profile page and the new banner read and write the same key, keeping them in sync automatically.

`localStorage` key: `backup-export-format` — `'encrypted' | 'plain'`, default `'encrypted'`.

---

## 4. Feature: backup reminder banner

### Data model (`localStorage`)

| Key | Type | Default |
|-----|------|---------|
| `backup-reminder-frequency` | `'never' \| 'daily' \| 'weekly' \| 'monthly'` | `'daily'` |
| `backup-reminder-dismissed-at` | ISO timestamp | unset |
| `last-backed-up-at` | ISO timestamp | unset |
| `backup-export-format` | `'encrypted' \| 'plain'` | `'encrypted'` |

`backup-export-format` is shared with fix 3 — one key, two consumers.

### `isDue` logic

```
lastAction   = max(last-backed-up-at ?? epoch, backup-reminder-dismissed-at ?? epoch)
lastMidnight = start of the local calendar day containing lastAction (00:00:00 local)
nextDue      = lastMidnight + period
isDue        = frequency !== 'never' AND now >= nextDue
```

Period mapping: daily = 1 day, weekly = 7 days, monthly = 30 days.

Rounding down to midnight means the reminder fires the first time the app is opened on the due calendar day, not a fixed number of hours after the last action.

### New files

**`src/hooks/useBackupReminder.ts`**

Pure-logic hook. No UI, no IDB, no network. Reads/writes `localStorage`, computes `isDue`, exposes:

```typescript
type BackupReminderFrequency = 'never' | 'daily' | 'weekly' | 'monthly';

interface UseBackupReminderReturn {
  isDue: boolean;
  frequency: BackupReminderFrequency;
  setFrequency: (f: BackupReminderFrequency) => void;
  dismiss: () => void;      // writes backup-reminder-dismissed-at = now
  recordExport: () => void; // writes last-backed-up-at = now
}
```

Both `dismiss` and `recordExport` write to `localStorage` and snap the clock. The midnight floor is applied at read time when computing `nextDue`.

**`src/backup/doExport.ts`**

Shared export function used by both the Profile page and the banner. Reads `backup-export-format` from `localStorage`, calls the appropriate export path (`encryptedExport` or `exportAppState` + zip), and triggers the browser download. Throws on failure so callers can handle errors.

**`src/components/backup/BackupReminderBanner.tsx`**

Renders only when `isDue`. Holds a local `sessionDismissed` boolean (useState, false on mount). Visible when `isDue && !sessionDismissed`.

Three actions:

| Action | Behaviour | Persisted? |
|--------|-----------|------------|
| **Export now** | Calls `doExport(db)`, then `recordExport()` on success. Shows loading state during export. Shows inline error on failure. Banner disappears on success. | yes — `last-backed-up-at` |
| **Remind me later** | Sets `sessionDismissed = true`. Banner reappears on next app load. | no — in-memory only |
| **× dismiss** | Calls `dismiss()` — writes `backup-reminder-dismissed-at`. Snoozes for one full period. | yes — `backup-reminder-dismissed-at` |

Mounted at the top of `src/components/dashboard/Dashboard.tsx`, above the chore list.

### Changed files

**`src/components/profile/ProfilePage.tsx`**

- Replace `exportFormat` useState with `localStorage`-backed value (see fix 3).
- Replace inline export logic with a call to `doExport(db)`.
- Call `recordExport()` after a successful export so the banner clock resets.
- Add a "Backup reminder" row to the existing Backup section:
  - Label: "Remind me to back up"
  - Four-option selector: Never / Daily (recommended) / Weekly / Monthly
  - Reads/writes `backup-reminder-frequency` via `useBackupReminder`.

### Testing

**`src/hooks/useBackupReminder.test.ts`** — unit tests for `isDue` (pure function, no mocking needed beyond `Date.now`):

| Scenario | `isDue` |
|----------|---------|
| No prior action, any non-never frequency | `true` |
| Dismissed today at any time, daily | `false` |
| Dismissed yesterday at 23:59, daily | `true` |
| Dismissed 6 days ago, weekly | `false` |
| Dismissed 7 days ago, weekly | `true` |
| Dismissed 29 days ago, monthly | `false` |
| Dismissed 30 days ago, monthly | `true` |
| Frequency = `'never'` | always `false` |
| After "Remind me later" | `isDue` remains `true` — session state hides the banner, not the hook |

`doExport` is covered by the existing export tests once updated for the PQ fix.
