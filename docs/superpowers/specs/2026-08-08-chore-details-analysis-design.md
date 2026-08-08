# Design: Improved Chore Details & Basic Data Analysis — Issues #61, #71

**Date:** 2026-08-08
**Issues:** [#61 Improved chore details page](https://github.com/a-ludi/tasks-harmony/issues/61), [#71 Basic Data Analysis](https://github.com/a-ludi/tasks-harmony/issues/71)

---

## Overview

Both issues centre on `ChorePage`. Issue #61 adds card controls to the details page and brings sorting + grouping to the completions table. Issue #71 adds totals and export. All table logic is extracted into a dedicated `CompletionsTable` component, while `ChorePage` handles chore info and card controls. This keeps the page component focused and isolates the complex sorting/grouping/export state in one place.

---

## 1. Reusable card-control components

Three self-contained components replace the ad-hoc control rendering in `ChoreCard` and will also be used by `ChorePage`. Each derives everything it needs from the store; the only external inputs are the `chore` object and an optional `disabled` flag.

### `CompleteButton`

Props: `chore: Chore, disabled?: boolean`

- Derives status internally (pulls `completions` and `now` from store / current time).
- Renders nothing when status is `upcoming`.
- Label is `"Complete"` for `due`/`overdue`, `"Complete again"` for `completed + repeatable`.
- Handles questions modal internally (existing `CompletionModal`).

### `QuickCompleteButton`

Props: `set: QuickAnswerSet, chore: Chore, disabled?: boolean`

Single quick-answer button with tooltip. Handles `recordCompletion` internally.

### `QuickCompleteButtonList`

Props: `chore: Chore, disabled?: boolean`

- Pulls `quickAnswerSets` for the chore from the store.
- Derives status; renders nothing when status is `upcoming` or no sets exist.
- Renders one `QuickCompleteButton` per set.

`ChoreCard` and `ChorePage` both simplify to the same three-tag pattern:

```tsx
<CompleteButton chore={chore} />
<QuickCompleteButtonList chore={chore} />
<ChoreActionsDropdown chore={chore} />  {/* Edit, Duplicate, Archive */}
```

`ChoreActionsDropdown` extracts the existing `⋮` dropdown from `ChoreCard` for reuse.

---

## 2. `ChorePage` restructure

A **controls bar** is inserted between the description and the "Completion History" heading:

```tsx
<div className="flex flex-wrap items-center gap-2 mb-6">
  <CompleteButton chore={chore} />
  <QuickCompleteButtonList chore={chore} />
  <ChoreActionsDropdown chore={chore} />
</div>
```

`ChorePage` pulls in the same store slices as `ChoreCard` (`xpSettings`, `profile`, `quickAnswerSets`, `deactivateChore`). Modal state (`showEditModal`, `showDuplicateDialog`, `editAfterDuplicateKey`) is encapsulated inside `ChoreActionsDropdown`, not `ChorePage`. The existing `CompletionModal`, `ChoreFormModal`, and `DuplicateChoreDialog` are reused unchanged.

The completions table is replaced by:

```tsx
<CompletionsTable completions={completions} questions={choreQuestions} />
```

---

## 3. `CompletionsTable` component

**File:** `src/components/chores/CompletionsTable.tsx`

**Props:**
```ts
interface Props {
  completions: Completion[];
  questions: Question[];
}
```

**Internal state:**
```ts
type SortDir = 'asc' | 'desc';
type SortKey = 'completedAt' | `question:${string}` | 'xpEarned';
interface SortEntry { key: SortKey; dir: SortDir; }

const [sorts, setSorts]         = useState<SortEntry[]>([]);
const [groupBys, setGroupBys]   = useState<string[]>([]);   // ordered question ids
const [openGroup, setOpenGroup] = useState<string | null>(null);
```

**Columns:** `completedAt` → question columns (in `question.order`) → `xpEarned`. Question columns only shown when `questions.length > 0`.

**Eligible group-by columns:** questions with type `'ENUM' | 'INTEGER' | 'BOOLEAN'`.

---

## 4. Sorting

### Click behaviour

- Click a column **not in `sorts`**: append `{ key, dir: 'asc' }`. The first-appended entry (`sorts[0]`) is the primary (most influential) sort.
- Click a column **already in `sorts`**: cycle `asc → desc → removed`.
- "Reset sorting" text link appears to the right of the last header cell whenever `sorts.length > 0`. Clicking sets `sorts` to `[]`.

### Header rendering

- Unsorted column: faint `↕` on hover.
- Sorted column: inline label showing direction then superscript priority, e.g. `↑²` or `↓¹`. Rendered as `&uarr;<sup>2</sup>` so sizing and placement can be adjusted via CSS.

### Sort value per column type

| Column | Sort value |
|---|---|
| `completedAt` | timestamp (ms) |
| INTEGER / MULTIPLIER answer | numeric; `null` sorts last |
| ENUM answer | choice `order` field |
| BOOLEAN answer | `false < true` |
| TEXT answer | locale string compare |
| `xpEarned` | numeric |

### Sort/group zone invariant

`sorts` is logically split into two contiguous zones:

```
sorts = [ ...groupSorts | ...extraSorts ]
```

- **`groupSorts`**: entries for group-by columns, in the same order as `groupBys`. A group-by column may be absent from `groupSorts` (group order then equals first-appearance order in the data).
- **`extraSorts`**: entries for non-grouped columns, always after `groupSorts`.

**The UI enforces this invariant automatically:**

- Adding a column to `groupBys` → inserts its sort entry at the end of `groupSorts` (before `extraSorts`), defaulting to `asc`. If it was in `extraSorts`, it moves to `groupSorts`.
- Removing a column from `groupBys` → drops its sort entry entirely.
- Clicking a grouped column header → cycles `asc → desc → unsorted` (removes from `groupSorts` but keeps in `groupBys`).
- Clicking a non-grouped column header → operates on `extraSorts` as normal.

---

## 5. Grouping

### Group-by selector UI

A compact toolbar above the table (left side):

- Active group-by columns shown as ordered chips: `Mood ×`, `Difficulty ×`.
- `+ Group by` dropdown listing eligible discrete question columns not yet selected.
- Removing a chip removes that column from `groupBys` (and drops its sort entry per §4).

### Group key derivation

For each completion, compute a tuple key by joining the display values of all `groupBys` columns with `|` (e.g. `"Happy|3"`). Group label: `"Mood: Happy, Difficulty: 3"`.

### Accordion rendering

- Each unique tuple = one accordion section.
- Section header (always visible): group label + per-group subtotals — `(N completions · X XP)`.
- Clicking a header: if it is `openGroup`, set `openGroup` to `null`; otherwise set to this group's key.
- Only the open group shows its completion rows.

When no `groupBys` are set, the table renders as a flat list.

---

## 6. Totals row

Always rendered at the bottom of the table, outside the accordion.

| Column | Grand total value |
|---|---|
| `completedAt` | `N completions` (count) |
| INTEGER / MULTIPLIER answer | sum (`null` treated as 0) |
| TEXT / ENUM / BOOLEAN answer | — |
| `xpEarned` | sum |

Per-group subtotals use the same rules and are shown inline in each group header.

---

## 7. Export

**Button:** `Export ▾` dropdown (top-right of toolbar). Items: *Export as CSV*, *Export as JSON*.

**Data:** always raw completions in chronological ascending order (`completedAt`). Current sort/group state is ignored.

**Filename template:** `YYYY-MM-DD-completions-<slugified-chore-title>.{csv,json}` — date is the moment of export.

### CSV

- One row per completion.
- ENUM questions produce **two columns**: `"Mood"` (display label) and `"Mood (index)"` (choice `order` value). All other types produce one column.
- `null` answers → empty string.
- Header row uses question prompts.
- Column order: `completedAt`, `streak`, question columns (in `question.order`), `xpEarned`. `streak` is included in export even though it is not shown in the UI table.

Example header: `completedAt,streak,Mood,Mood (index),Count,xpEarned`

### JSON

Array of objects:

```json
[
  {
    "completedAt": "2026-01-15T09:30:00.000Z",
    "xpEarned": 150,
    "streak": 3,
    "answers": [
      { "prompt": "Mood", "value": "Happy", "enumIndex": 2 },
      { "prompt": "Count", "value": 7 }
    ]
  }
]
```

`enumIndex` is present only for ENUM answers.

---

## 8. Testing

### Unit tests (pure logic)

- **Sort comparator:** each column type, multi-column tiebreaking, `null`-last behaviour.
- **Group key derivation:** single and compound `groupBys`, null answers, tuple uniqueness.
- **Totals computation:** sum for numeric columns, count for `completedAt`, blank for others.
- **Export formatting:** CSV double-ENUM columns, JSON `enumIndex`, filename slug, chronological order.
- **Sort/group invariant:** adding a group-by moves it from `extraSorts` → `groupSorts`; removing drops it.

### Component tests

- `CompleteButton`: renders nothing for `upcoming`; shows "Complete again" for `completed + repeatable`.
- `QuickCompleteButtonList`: renders nothing when no sets or status is `upcoming`.
- `CompletionsTable`: accordion opens/closes; "Reset sorting" appears only when sorts active; totals row always rendered.

### E2E (Playwright)

- Sort by one column then a second; verify badge numbers and row order.
- Add two group-by columns; verify tuple groups; opening one group closes the other.
- Export CSV: verify download triggered and filename matches template.
