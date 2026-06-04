# Chore Management — Design Spec

**Date:** 2026-06-04
**Issues:** #7 (Move chores between packs; safe pack deletion), #8 (Duplicate a chore)

---

## Overview

Two related features that let users reorganise their chores: moving a chore to a different pack via the edit modal, safely deleting a pack with a per-chore disposition dialog, and duplicating a chore with a lightweight dialog.

---

## Data model impact

### Chore key rewriting

`Chore.key` is the IndexedDB primary key with the format `${packId}/${choreId}`. Moving a chore changes its key, which cascades to:

- `Question.choreKey` (all questions for the chore)
- `Completion.choreKey` (all completions for the chore)

All key rewrite operations use **atomic IndexedDB transactions**: delete old chore → insert new chore → update questions → update completions. Either everything commits or nothing does.

### Collision resolution

A collision occurs when the target pack already contains a chore with the same `choreId`. Collision is resolved by appending a numeric suffix to both `choreId` and title, incrementing until both are free:

- `choreId`: `make-laundry` → `make-laundry-2` → `make-laundry-3` …
- `title`: `Make Laundry` → `Make Laundry 2` → `Make Laundry 3` …

When the original already carries a suffix (e.g. `make-laundry-2` / `"Make Laundry 2"`), a new suffix is appended to both as-is — existing suffixes are not parsed or incremented:
- `make-laundry-2` → `make-laundry-2-2`, `"Make Laundry 2"` → `"Make Laundry 2 2"`

### Deletion — completion history preservation

When a chore is deleted, its completions must be retained for XP integrity. The chore record and all its question records are deleted. Each completion's `choreKey` is rewritten to a freshly generated UUID (one UUID per deleted chore, shared across all its completions to keep them grouped). UUID format (`xxxxxxxx-xxxx-…`) cannot collide with any real chore key since real keys always contain `/`.

---

## Store actions

### `moveChore(choreKey, targetPackId)`

1. Derive `newKey = ${targetPackId}/${choreId}`.
2. Check for collision — return an error if the target pack already has that `choreId`. The caller handles the UI error; no DB write occurs.
3. In one atomic transaction: delete old chore → insert new chore (`key`, `packId` updated) → update `choreKey` on all questions → update `choreKey` on all completions.

### `deletePack(packId, dispositions: Array<{ choreKey, action: 'delete' | 'move', targetPackId? }>)`

Process each disposition in its own atomic transaction:

- **`delete`**: delete chore record + all question records, rewrite all completion `choreKey` values to a single fresh UUID.
- **`move`**: run `moveChore` logic; auto-resolve any collision using the numeric suffix rule (no user prompt — the dialog pre-resolves and shows the resolved name).

After all chores are processed, delete the pack record.

### `duplicateChore(choreKey, newTitle, targetPackId)`

1. Slugify `newTitle` to derive `newChoreId`.
2. Check for collision in `targetPackId`. If collision: return error (caller shows inline UI error).
3. In one atomic transaction: insert new chore (same settings as original, empty completion history, `key = ${targetPackId}/${newChoreId}`).
4. Copy all question records from the original, assigning new IDs and the new `choreKey`.

---

## UI components

### `ChoreFormModal` (existing — extended)

Add a **pack selector dropdown** below the chore name field, visible in **edit mode only** (when creating a chore the pack is fixed by context). On pack change, derive the candidate `choreId` from the current title and check for collision with the selected pack. If collision: disable the save button and show an inline error beneath the pack input. No other changes to the modal.

### `PackDeletionDialog` (new)

Triggered by the existing delete button on the pack page.

**Empty pack** (no chores): skip this dialog — show a simple "Delete pack?" confirmation and delete immediately.

**Non-empty pack**:

- **Global target pack selector** at the top (personal pack always exists as a valid target).
- **Scrollable chore list**: each row shows the chore name and a Delete / Move toggle. Move is the default. For chores set to Move where a collision would occur, the auto-resolved name is shown inline so the user can see the outcome.
- **"Apply same action to all"** button applies the current global selection to every chore.
- **Confirm / Cancel** at the bottom.

### `DuplicateChoreDialog` (new)

Triggered by a "Duplicate" action added to the chore card menu on all pages (dashboard and pack pages).

- **Pack selector**: defaults to the chore's current pack.
- **Name input**: pre-filled with `"[Original title] (copy)"` when the same pack is selected; pre-filled with the original title when a different pack is selected.
- **Inline error** beneath the name input on collision (both same-pack and cross-pack).
- **Three actions**: Cancel / Duplicate / Duplicate & Edit.
  - *Duplicate*: saves and closes.
  - *Duplicate & Edit*: saves first, then opens `ChoreFormModal` pre-filled with the new chore. If the user cancels the edit, the duplicate remains saved — no rollback.

---

## Edge cases

- **Personal pack cannot be deleted**: the delete button is not shown for personal packs. The personal pack always exists as a move target in all dialogs.
- **ChoreId derivation on rename**: slugified from the name input using the same rules as chore creation.
- **Numeric suffix search**: increment N from 2 until both the new `choreId` and title are free in the target pack.
- **Duplicate & Edit cancellation**: chore remains saved as duplicated. Consistent with how chore creation works.
- **`Duplicate & Edit` across packs**: `ChoreFormModal` opens with the new chore in the target pack context.
