# Design: Archive UI, Amend Completions, Streak Formula — Issues #60, #63, #64

**Date:** 2026-08-08
**Issues:** [#60 Proper Archive UI](https://github.com/a-ludi/tasks-harmony/issues/60), [#63 Amend completions after the deadline](https://github.com/a-ludi/tasks-harmony/issues/63), [#64 Streak in formula should be percent](https://github.com/a-ludi/tasks-harmony/issues/64)

---

## #64 — Streak as percent in XP formula

### Change

`XPFormula.tsx`: change how `streakRange` is computed to match the existing `decayRange` format.

**Before:**
```ts
const streakRange = `1–${settings.maxStreakMultiplier}`;
```

**After:**
```ts
const streakRange = `100%–${Math.round(settings.maxStreakMultiplier * 100)}%`;
```

No structural change to the component or operator rendering — the `×` operator and `Factor` label stay the same.

### Rationale

`1–2.5` reads as a subtraction expression. `100%–250%` follows the same convention as decay (`80%–100%`) and makes clear it is a percentage-range multiplier.

---

## #60 — Proper Archive UI

### Archive banner

When `archiveMode` is active, `Dashboard` renders a full-width notice strip immediately below the header, before the chore list. The strip uses a CSS construction-site stripe via inline style:

```tsx
style={{
  background: 'repeating-linear-gradient(45deg, #f59e0b 0px, #f59e0b 20px, #000 20px, #000 40px)'
}}
```

Text (e.g. *"Archived — read-only"*) is centered over the stripe with white color and a semi-transparent dark backing for legibility.

### Read-only `ChoreCard`

`ChoreCard` derives its mode from `chore.active`:

- **`CompleteButton`**: remains rendered but receives `disabled={true}`.
- **Quick-answer buttons**: remain rendered but receive `disabled={true}`.
- **Dropdown menu**: shows only a **Delete** item (destructive variant). Edit and Duplicate are removed.

### Delete confirmation

Clicking Delete opens a `Dialog` (replacing the current `window.confirm`) with:
- Title: *"Delete chore?"*
- Body: explains that completion history will be permanently lost, but total XP earned is preserved.
- Actions: Cancel / Delete (destructive).

### Flat list in archive mode

Status sections (Overdue, Due, Completed, Upcoming) are suppressed in archive mode. Archived chores are shown as a single unsectioned list, sorted alphabetically by title.

### Store

New action: `deleteChore(key: string)` — removes the chore record and all associated completions, questions, and quick answer sets from IndexedDB and Zustand state.

---

## #63 — Amend completions & retroactive logging

### Constraints

- **Editing `completedAt`**: allowed only within the completion's own window. For repeatable chores with multiple completions in the same window, additionally clamped to `(prev_completion_time, next_completion_time)` to preserve history order.
- **Retroactive completions**: can only be appended after all existing completions. Eligible past windows are closed windows whose index is strictly greater than the last existing completion's window index. If there are no existing completions, all closed past windows are eligible. For non-repeatable chores, windows that already contain a completion are excluded (safety guard).
- **XP**: recalculated and overwritten on amendment. For retroactive completions, `totalCompletions` = number of existing completions at save time (same as a normal completion).
- **Streak**: not recalculated on existing completions. For retroactive completions, computed normally against the last completion's window.

### 1. Edit existing completion — `ChorePage`

Each row in the completion history table gains an **Edit** button (rightmost column). Clicking opens `AmendCompletionModal`:

- `completedAt` datetime input constrained to `[window_start, window_end]`, further clamped to `(prev_completion_time, next_completion_time)` where applicable.
- Answers form: identical question fields to `CompletionModal`.
- On save: `amendCompletion(id, { completedAt, answers })` store action — updates the record and recalculates `xpEarned`.

### 2. Log past completion — split `CompleteButton`

`CompleteButton` becomes a **split button**: primary `[Complete]` action (existing behaviour) + a `[▾]` dropdown trigger.

The dropdown contains one item: **"Log past completion"**.

Disabled when the set of eligible past windows is empty — i.e. no closed window exists after the last completion's window that satisfies per-window limits.

Clicking opens `LogPastCompletionModal`:

- **Window selector**: lists eligible past windows as human-readable date ranges. User selects one.
- **`completedAt` picker**: defaults to the window's end time, constrained to `[window_start, window_end]`.
- **Answers form**: identical question fields to `CompletionModal`.
- On save: `recordRetroactiveCompletion(choreKey, { completedAt, answers })` — streak and XP computed via the same logic as `recordCompletion`, using the caller-supplied timestamp.

### Store

- `amendCompletion(id: string, patch: { completedAt: string; answers: Answer[] })` — updates the completion record, recalculates and overwrites `xpEarned` using the currently active `XPSettings`.
- `recordRetroactiveCompletion(choreKey: string, data: { completedAt: string; answers: Answer[] })` — creates a new completion using the normal XP/streak computation path, with a caller-supplied timestamp instead of `new Date()`.

---

## Testing

- **#64**: unit test for `streakRange` output in `XPFormula` — verify `100%–N%` format.
- **#60**: unit/integration tests for `deleteChore` cascade; snapshot or assertion for read-only `ChoreCard` in archived state; banner renders in archive mode.
- **#63**: unit tests for `amendCompletion` (XP recalculation, order-preservation constraint); unit tests for `recordRetroactiveCompletion` (XP/streak computation, eligible window filtering); E2E for the split button flow and edit modal.
