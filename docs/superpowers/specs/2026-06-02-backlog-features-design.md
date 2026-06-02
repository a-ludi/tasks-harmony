# Backlog Features — Design Spec

**Date:** 2026-06-02

**Goal:** Implement the seven backlog items above the divider: score multiplier question type, XP in mobile title bar, delete pack, CDP export metadata, completions list page, questions during chore creation, and XP size labels in the chore form.

---

## 1. Question Type Refactor — Discriminated Union

Replace the flat `Question` interface in `src/types/index.ts` with a discriminated union. Each variant carries only the fields it owns.

```ts
interface BaseQuestion {
  id: string;
  choreKey: string;
  prompt: string;
  required: boolean;
  order: number;
}

export interface TextQuestion     extends BaseQuestion { type: 'TEXT';       regexPattern?: string }
export interface IntegerQuestion  extends BaseQuestion { type: 'INTEGER';    minValue?: number; maxValue?: number }
export interface BooleanQuestion  extends BaseQuestion { type: 'BOOLEAN' }
export interface EnumQuestion     extends BaseQuestion { type: 'ENUM';       choices?: EnumChoice[] }
export interface MultiplierQuestion extends BaseQuestion {
  type: 'MULTIPLIER';
  xpPerUnit: number;                         // positive float; labelled "weight" in the UI
  multiplierAnswerType: 'integer' | 'float';
}

export type Question    = TextQuestion | IntegerQuestion | BooleanQuestion | EnumQuestion | MultiplierQuestion;
export type QuestionType = Question['type'];  // derived — no separate enum to maintain
```

Remove the old `Question` interface and `QuestionType` alias. The compiler will flag every site that reads a type-specific field without narrowing — those are the places that need updating.

`DraftQuestion` in `src/components/questions/QuestionFormFields.tsx` mirrors this union with an added `_isNew?: boolean` and `_deleted?: boolean`. It becomes:

```ts
export type DraftQuestion =
  | (TextQuestion     & { _isNew?: boolean; _deleted?: boolean })
  | (IntegerQuestion  & { _isNew?: boolean; _deleted?: boolean })
  | (BooleanQuestion  & { _isNew?: boolean; _deleted?: boolean })
  | (EnumQuestion     & { _isNew?: boolean; _deleted?: boolean })
  | (MultiplierQuestion & { _isNew?: boolean; _deleted?: boolean });
```

`AppState.questions` type in `src/types/index.ts` changes from `Question[]` to `Question[]` (no change in declaration — the union is now `Question`).

---

## 2. Score Multiplier Question Type

### 2.1 Formula

```
actualXP = Math.round(calculateXP(xpSize, streak, totalCompletions, settings) × xpPerUnit × answer)
```

`calculateXP` is unchanged. The multiplier is applied in `recordCompletion` after the base XP is computed. If the chore has no `MULTIPLIER` question, the formula reduces to `calculateXP(...)` as today.

### 2.2 Constraints

- At most one `MULTIPLIER` question per chore. Enforced in `validateQuestionDrafts` and in the QuestionBuilder UI (option disabled once one exists).
- `MULTIPLIER` questions are always `required: true`. The "Required" toggle is hidden and fixed on in `QuestionFormFields` when `type === 'MULTIPLIER'`.
- `xpPerUnit` must be > 0 (validated in `QuestionFormFields`).
- The answer at completion time must be > 0 (validated in `CompletionModal`).

### 2.3 Store change — `recordCompletion`

After calling `calculateXP`, check for a `MULTIPLIER` question:

```ts
const multiplierQ = questions.find(
  (q): q is MultiplierQuestion => q.choreKey === choreKey && q.type === 'MULTIPLIER'
);
let xpEarned = calculateXP(chore.xpSize, streak, totalCompletions, activeSettings);
if (multiplierQ) {
  const answer = answers.find((a) => a.questionId === multiplierQ.id);
  if (answer && typeof answer.value === 'number' && answer.value > 0) {
    xpEarned = Math.round(xpEarned * multiplierQ.xpPerUnit * answer.value);
  }
}
```

### 2.4 QuestionBuilder UI

In `QuestionFormFields`:
- Add `MULTIPLIER` to the type dropdown as **"Score Multiplier"**
- When selected, show:
  - **Weight** field: positive float input (`min="0.0001"`, `step="any"`), labelled "Weight"
  - **Answer type** radio: "Integer" / "Float"
- Hide the "Required" toggle when `type === 'MULTIPLIER'`
- If a `MULTIPLIER` draft already exists in the list, disable the "Score Multiplier" option in the type dropdown for all other questions, with tooltip: *"Only one multiplier per chore"*

### 2.5 CompletionModal answer rendering

For a `MULTIPLIER` question:
- Render a number input: `min="1" step="1"` for integer, `min="0.0001" step="any"` for float
- Below the input, a small hint: `× {xpPerUnit}` (formatted without trailing zeros, e.g. `× 0.5`, `× 2`)

---

## 3. Questions During Chore Creation

### 3.1 Current state

`ChoreFormModal` hides the `QuestionBuilder` in create mode and shows a note: *"Questions can be added after creating the chore by clicking Edit (✎)."*

### 3.2 Changes

- Remove the `{isEdit && ...}` guard; render `QuestionBuilder` in both create and edit modes
- Remove the "Questions can be added after creating" note
- In create mode, pass `''` (empty string) as `choreKey` to `QuestionBuilder` — drafts use client-generated UUIDs so no real key is needed during editing
- After `addChore(...)` resolves, remap drafts to inject the real key, then save:

```ts
const newChoreKey = await addChore({ ... });
if (questionDrafts.some((d) => !d._deleted)) {
  const withKey = questionDrafts.map((d) => ({ ...d, choreKey: newChoreKey }));
  await saveQuestions(newChoreKey, withKey);
}
```

Note: `saveQuestions` uses `draft.choreKey` when persisting, not its `choreKey` parameter — remapping is necessary.

### 3.3 Store change — `addChore` return type

Change signature from `Promise<void>` to `Promise<string>` (returns the new `choreKey`). The implementation already constructs `key: \`${data.packId}/${choreId}\`` — just return it.

---

## 4. XP in Mobile Title Bar

In `src/App.tsx`, the mobile `<header>` (the `md:hidden` bar) gains the XP pill between the title link and the right edge:

```tsx
<span className="ml-auto rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
  {totalXP.toLocaleString()} XP
</span>
```

`totalXP` is computed from `completions` read from the store — the same selector already used in `Sidebar.tsx`.

---

## 5. Delete Pack

### 5.1 Store action

New action `deletePack(packId: string): Promise<void>` added to `src/store/index.ts`:

1. Find all chores where `chore.packId === packId`
2. Delete all completions where `completion.choreKey` is in that set
3. Delete all questions where `question.choreKey` is in that set
4. Delete all chores in that set
5. Delete the pack record
6. Update store state (remove all affected entities from their arrays)

The personal pack (`pack.isPersonal === true`) cannot be deleted. The action throws if called with the personal pack ID.

### 5.2 UI

In `PackDashboard`, add a **Delete Pack** button in the pack header. Hidden when `pack.isPersonal === true`.

On click, show a `window.confirm` dialog:
> *"Delete [Pack Name] and all its chores? This cannot be undone."*

On confirm: call `deletePack(pack.id)`, then `navigate('/')`.

---

## 6. CDP Export Metadata

### 6.1 `buildCDPZip` signature change

```ts
export function buildCDPZip(pack: Pack, chores: Chore[], profile: UserProfile): Uint8Array
```

### 6.2 `__pack__.yaml` additions

Two new fields in the manifest output:

- **`author`**: composed from `profile.displayName` and `profile.email`:
  - Both present: `"Name <email>"`
  - Name only: `"Name"`
  - Email only: `"<email>"`
  - Neither: field omitted
- **`createdAt`**: ISO 8601 timestamp at the moment of export, with seconds resolution (e.g. `2026-06-02T14:30:00Z`). Always included.

The YAML schema accepts `author` as either a string or a list of strings (documented in the schema definition). The export always emits a single string.

### 6.3 Call-site update

`PackDashboard` passes `profile` (from the store) as the third argument to `buildCDPZip`.

---

## 7. Completions List Page

### 7.1 Route

`/chores/:encodedChoreKey/completions` where `encodedChoreKey = encodeURIComponent(chore.key)`.

Added to `src/App.tsx` alongside the existing routes.

### 7.2 Component — `CompletionsPage`

**File:** `src/components/completion/CompletionsPage.tsx`

- Reads `encodedChoreKey` from params; decodes via `decodeURIComponent`
- Looks up the chore from the store; redirects to `/` if not found
- **Back button**: `useNavigate(-1)`, displayed above the heading
- **Heading**: chore title
- **Table**:
  - Columns: **Completed at** (formatted local date/time) | one column per question on that chore (column header = `question.prompt`) | **XP earned**
  - Rows: completions sorted newest-first; each answer cell shows the value for that question (blank if not answered)
  - Empty state: *"No completions yet."*

### 7.3 ChoreCard link

Add a small **"Completions"** text button to `ChoreCard` that navigates to the completions page for that chore. Rendered below the chore title, styled as a secondary/muted link.

---

## 8. XP Size Labels in Chore Form

In `src/components/chores/ChoreFormModal.tsx`, each XP size option in the size selector displays the base XP value:

```tsx
import { XP_BASE } from '@/xp/calculator';

// in the select options:
{XP_SIZES.map((size) => (
  <option key={size} value={size}>{size} ({XP_BASE[size]} XP)</option>
))}
```

No other changes to this section.

---

## 9. File Map

| File | Action | Purpose |
|---|---|---|
| `src/types/index.ts` | Modify | Replace flat `Question` with discriminated union; add `MultiplierQuestion` |
| `src/components/questions/QuestionFormFields.tsx` | Modify | Update `DraftQuestion` to union; add MULTIPLIER fields + type guard |
| `src/components/questions/QuestionBuilder.tsx` | Modify | Enforce at-most-one MULTIPLIER constraint |
| `src/components/questions/validation.test.ts` | Modify | Add MULTIPLIER validation tests |
| `src/components/questions/validation.ts` | Modify | Add MULTIPLIER validation (at-most-one, xpPerUnit > 0) |
| `src/store/index.ts` | Modify | `addChore` → `Promise<string>`; `recordCompletion` applies multiplier; add `deletePack`; `AppState` interface updated |
| `src/components/chores/ChoreFormModal.tsx` | Modify | Show QuestionBuilder in create mode; save questions after addChore; XP size labels |
| `src/components/completion/CompletionModal.tsx` | Modify | Render MULTIPLIER answer input with hint |
| `src/components/completion/CompletionsPage.tsx` | Create | Completions history table |
| `src/components/dashboard/ChoreCard.tsx` | Modify | Add Completions button/link |
| `src/components/packs/PackDashboard.tsx` | Modify | Add Delete Pack button; pass profile to buildCDPZip |
| `src/cdp/cdp-export.ts` | Modify | Accept profile; emit author + createdAt |
| `src/cdp/cdp-export.test.ts` | Modify | Test author formatting and createdAt |
| `src/App.tsx` | Modify | XP in mobile header; add completions route |
