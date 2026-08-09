# Pre-filled Completions (Targets) — Design Spec

**Date:** 2026-08-09
**Issue:** #72
**Status:** Approved

---

## Goal

Allow the user to define a pre-set list of completions for a chore that has at least one question. Each item in the list is called a **Target**. The goal of the chore is to complete every target. This turns a recurring chore into a finite collection challenge.

**Example:** "Visit all terminal stations of the city tram system." The chore has one question "Terminal Station?" The user pre-defines all station names as targets. Each visit logs a completion for the matching target. The chore is done when all stations have been visited.

---

## Glossary Addition

| Term | Meaning |
|---|---|
| **Target** | A pre-defined completion for a chore — a set of pre-filled answers for at least one of the chore's questions. |
| **Set** | The full collection of targets for a chore. |
| **Set-completion bonus** | Optional extra XP awarded when a real completion causes all targets to be done for the first time. |

---

## 1. Data Model

### 1.1 New `Target` type

```typescript
interface Target {
  id: string;
  choreKey: string;
  order: number;
  answers: Answer[];   // partial — only the pre-filled questions; at least one must be non-null
}
```

A target is **done** when at least one `Completion` has `targetId === target.id`. For repeatable chores, multiple completions may share the same `targetId`; the target is still binary done/not-done.

### 1.2 `Completion` — new optional fields

```typescript
targetId?: string;           // links this completion to a target
setCompletionBonus?: number; // bonus XP included in xpEarned (set on the triggering completion only)
```

### 1.3 `Chore` — new optional field

```typescript
completionBonusXPSize?: XPSize | number;
// absent  → no set-completion bonus
// present → bonus of this XP size, awarded once when all targets are first completed by a real completion
```

The default value shown in the UI when the user opts in is the chore's current `xpSize`, but `undefined` means no bonus — there is no implicit default in the data model.

### 1.4 `AppState`

```typescript
targets: Target[];
```

---

## 2. Target Definition UI (Chore Form)

The **Targets** section appears in `ChoreFormModal` immediately after the Questions section. It is only rendered when the chore has at least one question (any type, including MULTIPLIER).

### 2.1 Mutual exclusivity with Quick Answer Sets

Targets and Quick Answer Sets are **mutually exclusive**:
- When targets are defined, the Quick Answer Sets section is hidden with a note: "Not available when targets are defined."
- When quick answer sets exist, the Targets section is hidden with a note: "Not available when quick answer sets are defined."
- No data is destroyed — removing all targets restores the Quick Answer Sets section intact, and vice versa.
- When the user first adds a target while quick answer sets exist, a warning explains they will be hidden.
- As a consequence, `QuickCompleteButtonList` renders nothing on target chores (both on `ChoreCard` and `ChorePage`) since there are no quick answer sets to show.

### 2.2 Section layout

```
[ Targets  3 target(s) ]

  ☐ Set completion bonus  [XP size picker — shown when checked, pre-filled with chore's xpSize]

  [ + Add target ]
  ┌──────────────────────────────────────────────┐
  │ ↑ ↓  Terminal Station: Hauptbahnhof  [Edit][×]│
  │ ↑ ↓  Terminal Station: Ostbahnhof    [Edit][×]│
  └──────────────────────────────────────────────┘
```

The set-completion bonus toggle and XP picker appear **above** the target list so they remain visible regardless of list length.

Soft-delete follows the question pattern: removed targets show faded with a "Restore" option; deletion is committed on form save.

### 2.3 `DraftTarget` (internal form type)

```typescript
interface DraftTarget {
  id: string;
  order: number;
  answers: Answer[];
  linkedCompletionId?: string;
  _deleted?: boolean;
}
```

### 2.4 `TargetFormModal` (secondary modal)

Adding or editing a target opens a secondary `TargetFormModal`. It reuses `AnswerForm` (extracted from `CompletionModal` — see §3.1). All question fields are optional in this context; validation requires at least one non-null answer before saving.

**Opening behaviour:**
- **New target, unlinked completions exist** → opens on Step 1 (import from history)
- **New target, no unlinked completions** → opens directly on Step 2 (answer form)
- **Editing existing target** → opens directly on Step 2 (answer form)

**Step 1 — Import from history (optional)**

A read-only, sortable completions table (reusing `CompletionsTable` style, no grouping, no export) showing only unlinked completions — those without an existing `targetId`. Completions already linked to a target are excluded.

Picking a row pre-fills Step 2 with that completion's answers and records `linkedCompletionId`. A "Skip — enter manually" link bypasses this step.

**Step 2 — Edit answers**

`AnswerForm` with all questions shown as optional fields. A back arrow returns to Step 1 if applicable.

Stepper buttons are fixed at the bottom of the modal: `← Back` (left) / `Save` (right).

---

## 3. Completion Flow

### 3.1 Extracted `AnswerForm` component

The answer fields and validation logic are extracted from `CompletionModal` into a standalone `AnswerForm`:

```typescript
interface AnswerFormProps {
  questions: Question[];
  answers: Record<string, string | number | boolean | null>;
  errors: Record<string, string>;
  onChange: (questionId: string, value: string | number | boolean | null) => void;
}
```

`CompletionModal` becomes a thin wrapper: `AnswerForm` inside a Dialog with Submit / Cancel buttons. Behaviour is unchanged for non-target chores.

### 3.2 `TargetsTable` component

A sortable table of targets. Columns: one per question (showing pre-filled value), plus a "Completed at" column. Sortable headers (same pattern as `CompletionsTable`). No grouping. No export.

**Props:**
```typescript
interface TargetsTableProps {
  targets: Target[];
  completions: Completion[];   // used to determine done status and completedAt
  questions: Question[];
  showCompleted: boolean;      // controlled externally
  interactive?: boolean;       // enables radio selection; default false
  selectedTargetId?: string;
  onSelect?: (targetId: string) => void;
}
```

- **Pending rows**: full opacity, clickable when `interactive`
- **Completed rows**: greyed out, hidden when `showCompleted` is false; "Completed at" column also hidden when `showCompleted` is false

### 3.3 `TargetPickerModal` — three-step flow

Replaces `CompletionModal` when the chore has targets. The modal footer is sticky (always visible); content scrolls independently.

**Step 1 — Select a target**

Renders `TargetsTable` in interactive mode. A radio button in the first column marks the selection. Selecting a row enables the "Complete" button in the footer.

Above the table: "Show completed / Hide completed" toggle (hidden-files pattern — completed targets hidden by default).

Footer: `Cancel` | `Complete` (disabled until selection)

On "Complete":
- All questions pre-filled → record completion → set completed? → Step 3 : close modal
- Some questions unfilled → Step 2

**Step 2 — Fill remaining answers**

`AnswerForm` for unfilled questions only (pre-filled answers are not shown again).

Footer: `← Back` | `Complete`

On "Complete" → record completion → set completed? → Step 3 : close modal

**Step 3 — Celebration (set completion only)**

Shown only when the just-recorded completion causes all targets to be done for the first time.

Content: large `trophy.svg` image with a CSS bounce-in entrance animation (`scale 0 → 1.1 → 1`), confetti burst via `canvas-confetti` fired in a `useEffect` on mount, congratulatory heading, summary of total targets and bonus XP earned (e.g. `+120 XP bonus`).

Footer: `Done` (closes modal)

### 3.4 Set-completion bonus logic

Runs after every target completion is recorded:

1. Are all targets for this chore done (each has ≥ 1 linked completion)?
2. Does any existing completion for this chore already have `setCompletionBonus > 0`?
3. If (1) is true and (2) is false: calculate bonus XP from `completionBonusXPSize`, add to the just-recorded completion's `xpEarned`, and set `completion.setCompletionBonus` to that amount.

The bonus fires **at most once** per chore, and only via a real (new) completion — never via retroactive linking.

### 3.5 `CompleteButton` routing

`CompleteButton` reads `targets` from the store. If `targets.some(t => t.choreKey === chore.key)`, it opens `TargetPickerModal` instead of `CompletionModal`.

---

## 4. ChoreCard Progress Bar

Rendered in `CardContent`, after the XP / streak / recurrence row, before `QuickCompleteButtonList`. Only shown when the chore has targets.

Matches the pack progress bar pattern (same markup, same `h-2 rounded-full` bar):

```
Target progress          3 / 10        ← label row
████████░░░░░░░░░░░░░░                 ← green fill
```

When all targets are done: right side shows a green `Completed` pill (matching pack's `xpCompleted` style).

**Compact mode:** label row is hidden (`compact` prop). The bar `div` carries `title="3 / 10 targets"` for hover.

---

## 5. ChorePage — Unified Completion History + Targets Table

`ChorePage` shows a single **Completion History** table that combines completion rows and pending target rows. Pending targets are the "hidden files" — hidden by default, revealed with a toggle.

**Toggle:** a "Show targets / Hide targets" button above the table controls visibility of pending target rows.

**Row types in the table:**

| Row type | Completed at | Answers | XP earned | Style |
|---|---|---|---|---|
| Completion (linked or free) | timestamp | recorded answers | amount | normal |
| Pending target | — | pre-filled answers | — | greyed out |

Completed targets already appear as their linked completion row — no duplication. Only pending targets (no linked completion) appear as the additional hidden rows.

Sorting applies to both row types; pending target rows sort on their pre-filled answer values, with `completedAt` treated as null (sorts to end when ascending).

---

## 6. Migration — Existing Completions as Target Suggestions

### 6.1 Adding targets to a chore with existing completions

When a chore already has completions and the user opens `TargetFormModal` to add a new target, Step 1 is shown (if unlinked completions exist). The user can pick an existing completion to pre-fill the target's answers, then edit as needed (e.g. clear a field that should be filled at completion time).

Linking a completion to a target (`linkedCompletionId`) retroactively marks that target as **done** — it counts toward set progress. The linked completion's `targetId` is set when `saveTargets` is called.

**No automatic/retroactive matching** — all linking is explicit and user-initiated.

### 6.2 Removing targets from a chore

When all targets are deleted and the form is saved:
- Targets are removed from the `targets` store
- Linked completions have their `targetId` cleared (become plain completions)
- Any `setCompletionBonus` already earned on a past completion is preserved as historical XP

---

## 7. Store / Persistence / DB

### 7.1 DB version bump: 4 → 5

```typescript
if (oldVersion < 5) {
  const targets = db.createObjectStore('targets', { keyPath: 'id' });
  targets.createIndex('by-chore', 'choreKey');
}
```

No data migration required for existing stores.

### 7.2 Zod schema changes (`src/schemas/validate.ts`)

- New `targetSchema` (strict): `id`, `choreKey`, `order`, `answers`
- `choreSchema`: add `completionBonusXPSize: xpSizeSchema.optional()`
- `completionSchema`: add `targetId: z.string().optional()`, `setCompletionBonus: z.number().optional()`
- `appStateZodSchema`: add `targets: z.array(targetSchema).optional()`

Note: `completionSchema` currently uses `.strict()` — the new optional fields must be added before the strict check or the schema will reject existing exports. The `appStateZodSchema` treats `targets` as optional for backwards compatibility with existing exports.

### 7.3 New store actions

- **`saveTargets(choreKey, drafts: DraftTarget[])`** — upsert / soft-delete targets; sets `targetId` on any linked completion
- **`recordCompletion`** — updated to accept optional `targetId`; after saving, runs set-completion bonus check and patches `xpEarned` + `setCompletionBonus` on the same completion if triggered
- **`linkCompletionToTarget(completionId, targetId)`** — standalone action used in `TargetFormModal` Step 1 for retroactive linking

### 7.4 New DB helper functions (`src/db/index.ts`)

- `getAllTargets(db)`
- `getTargetsByChore(db, choreKey)`
- `putTarget(db, target)`
- `deleteTarget(db, id)`

---

## 8. New Dependencies

- **`canvas-confetti`** — confetti burst on set-completion celebration screen (~3 KB gzipped, zero dependencies)
- **`trophy.svg`** — local SVG asset at project root, referenced as `/trophy.svg`
