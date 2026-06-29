# Chore Form UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve scheduling, scoring, XP, and pack-management UX across the chore and pack editing surfaces, as specified in `docs/superpowers/specs/2026-06-29-chore-form-ux-improvements-design.md`.

**Architecture:** Foundational type + helper changes land first (Tasks 1–2) so every downstream task compiles cleanly; pure UI components (WindowBar, XPFormula) are built standalone before being wired into ChoreFormModal; PackOptionsModal is built last. No data migrations required — all model additions are optional fields.

**Tech Stack:** React 19, TypeScript 5, Zustand 5, Tailwind CSS 4, Bun (runtime + test runner), `bun:test` for unit tests.

---

## File map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `src/types/index.ts` | `Chore.xpSize: XPSize \| number`; `PackManifest.decay`, `.defaultXPSize` |
| Modify | `src/xp/calculator.ts` | Add `getXPBase()`; update `calculateXP` signature |
| Modify | `src/xp/xpPreview.ts` | Use `getXPBase` |
| Modify | `src/xp/calculator.test.ts` | Tests for `getXPBase` |
| Modify | `src/store/index.ts` | Respect `manifest.decay` when calling `calculateXP` |
| Create | `src/chores/dueDateConversion.ts` | `toFirstDueDate()`, `firstDueDateToStartDate()`, `formatDurationMs()` |
| Create | `src/chores/dueDateConversion.test.ts` | Unit tests for above |
| Create | `src/components/chores/WindowBar.tsx` | Proportional window-period bar |
| Create | `src/components/chores/XPFormula.tsx` | Read-only XP formula display |
| Modify | `src/components/chores/ChoreFormModal.tsx` | All chore-form changes |
| Modify | `src/components/questions/QuestionFormFields.tsx` | Remove MULTIPLIER from type selector |
| Create | `src/components/packs/PackOptionsModal.tsx` | Pack settings modal |
| Modify | `src/components/packs/PackDashboard.tsx` | Slim kebab + wire PackOptionsModal |

---

## Task 1: Extend types and add `getXPBase` helper

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/xp/calculator.ts`
- Modify: `src/xp/xpPreview.ts`
- Modify: `src/xp/calculator.test.ts`
- Modify: `src/components/dashboard/ChoreCard.tsx` (compile fix only — no logic change)

- [ ] **Step 1: Write failing tests for `getXPBase`**

Add to `src/xp/calculator.test.ts` (after the existing `describe('XP_BASE', ...)` block):

```ts
import { describe, expect, test } from 'bun:test';
import { calculateXP, XP_BASE, getXPBase } from './calculator';
// … existing imports and fixtures …

describe('getXPBase', () => {
  test('returns XP_BASE value for named size', () => {
    expect(getXPBase('M')).toBe(8);
    expect(getXPBase('XXS')).toBe(2);
    expect(getXPBase('XXXL')).toBe(55);
  });
  test('returns the number itself for a custom numeric size', () => {
    expect(getXPBase(10)).toBe(10);
    expect(getXPBase(100)).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL** (`getXPBase is not exported`)

```bash
bun test --isolate src/xp/calculator.test.ts
```

- [ ] **Step 3: Update `src/types/index.ts`**

Change line 60:
```ts
xpSize: XPSize | number;
```

Add to `PackManifest`:
```ts
decay?: boolean;           // default true; false disables decay mechanics for all chores
defaultXPSize?: XPSize | number; // pre-fills XP size when creating a new chore in this pack
```

- [ ] **Step 4: Update `src/xp/calculator.ts`**

```ts
import type { XPSettings, XPSize } from '@/types';

export const XP_BASE: Record<XPSize, number> = {
  XXS: 2, XS: 3, S: 5, M: 8, L: 13, XL: 21, XXL: 34, XXXL: 55,
};

export function getXPBase(xpSize: XPSize | number): number {
  return typeof xpSize === 'number' ? xpSize : XP_BASE[xpSize];
}

export function calculateXP(
  xpSize: XPSize | number,
  streakCount: number,
  totalCompletions: number,
  settings: XPSettings,
): number {
  const base = getXPBase(xpSize);
  const { maxStreakMultiplier, decayFloor, streakHalfLife, decayHalfLife } = settings;
  const streakMult = maxStreakMultiplier
    - (maxStreakMultiplier - 1) * Math.exp(-Math.LN2 / streakHalfLife * streakCount);
  const decayMult = decayFloor
    + (1 - decayFloor) * Math.exp(-Math.LN2 / decayHalfLife * totalCompletions);
  return Math.round(base * streakMult * decayMult);
}
```

- [ ] **Step 5: Update `src/xp/xpPreview.ts`**

```ts
import type { XPSize, XPSettings } from '@/types';
import { getXPBase } from './calculator';

export function buildXPPreview(xpSize: XPSize | number, settings: XPSettings): string {
  const base = getXPBase(xpSize);
  const max = Math.round(base * settings.maxStreakMultiplier);
  if (max === base) return `${base} XP`;
  return `${base} XP · up to ${max} XP at max streak`;
}

export function toRepetitionFactor(xpPerUnit: number): number {
  if (!Number.isFinite(xpPerUnit) || xpPerUnit <= 0) return 1;
  return Math.max(1, Math.round(1 / xpPerUnit));
}

export function buildMultiplierXPPreview(repetitionFactor: number): string {
  return `÷${repetitionFactor} per unit answered`;
}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
bun test --isolate src/xp/calculator.test.ts
```

- [ ] **Step 7: Typecheck**

```bash
bun run typecheck
```

Fix any errors (likely `ChoreCard.tsx` — `calculateXP` now accepts `XPSize | number` so no change needed; `ChoreFormModal.tsx` still compiles since `XPSize` satisfies `XPSize | number`).

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/xp/calculator.ts src/xp/xpPreview.ts src/xp/calculator.test.ts
git commit -m "feat: add getXPBase helper and extend xpSize/PackManifest types"
```

---

## Task 2: Respect `decay` flag in store

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Update `completeChore` in `src/store/index.ts`**

Find the block around line 167 that reads:
```ts
const packStreak = chorePack?.manifest.streak ?? true;
// …
const streak = packStreak ? computeNewStreak(chore, choreCompletions, now) : 0;
// …
let xpEarned = calculateXP(chore.xpSize, streak, totalCompletions, activeSettings);
```

Change to:
```ts
const packStreak = chorePack?.manifest.streak ?? true;
const packDecay = chorePack?.manifest.decay ?? true;
// …
const streak = packStreak ? computeNewStreak(chore, choreCompletions, now) : 0;
const effectiveTotalCompletions = packDecay ? totalCompletions : 0;
// …
let xpEarned = calculateXP(chore.xpSize, streak, effectiveTotalCompletions, activeSettings);
```

When `totalCompletions` is 0 the decay formula evaluates to 1 (verified: `decayFloor + (1-decayFloor)*exp(0) = 1`), so passing 0 is the correct way to skip decay without changing `calculateXP`'s signature.

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/store/index.ts
git commit -m "feat: skip XP decay when pack manifest sets decay: false"
```

---

## Task 3: Due-date conversion utilities

**Files:**
- Create: `src/chores/dueDateConversion.ts`
- Create: `src/chores/dueDateConversion.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/chores/dueDateConversion.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import {
  toFirstDueDate,
  firstDueDateToStartDate,
  formatDurationMs,
} from './dueDateConversion';
import type { Recurrence } from '@/types';

function rec(
  frequency: Recurrence['frequency'],
  interval: number,
  startDate: string,
  windowStartTime = '00:00',
): Recurrence {
  return { frequency, interval, startDate, windowStartTime };
}

describe('toFirstDueDate', () => {
  it('daily/1: first due date = startDate + 1 day', () => {
    expect(toFirstDueDate(rec('daily', 1, '2026-06-25'))).toBe('2026-06-26');
  });
  it('weekly/1: first due date = startDate + 7 days', () => {
    expect(toFirstDueDate(rec('weekly', 1, '2026-06-25'))).toBe('2026-07-02');
  });
  it('monthly/1: first due date = startDate + 1 month', () => {
    expect(toFirstDueDate(rec('monthly', 1, '2026-06-01'))).toBe('2026-07-01');
  });
  it('weekly/2: first due date = startDate + 14 days', () => {
    expect(toFirstDueDate(rec('weekly', 2, '2026-06-11'))).toBe('2026-06-25');
  });
});

describe('firstDueDateToStartDate', () => {
  it('daily/1: startDate = firstDueDate − 1 day', () => {
    expect(firstDueDateToStartDate('2026-06-26', 'daily', 1, '00:00')).toBe('2026-06-25');
  });
  it('weekly/1: startDate = firstDueDate − 7 days', () => {
    expect(firstDueDateToStartDate('2026-07-02', 'weekly', 1, '00:00')).toBe('2026-06-25');
  });
  it('round-trips correctly', () => {
    const original = '2026-06-25';
    const r = rec('weekly', 1, original);
    const firstDue = toFirstDueDate(r);
    const back = firstDueDateToStartDate(firstDue, 'weekly', 1, '00:00');
    expect(back).toBe(original);
  });
});

describe('formatDurationMs', () => {
  it('rounds to days when >= 1 day', () => {
    expect(formatDurationMs(7 * 86_400_000)).toBe('7 days');
    expect(formatDurationMs(1 * 86_400_000)).toBe('1 day');
  });
  it('rounds to hours when < 1 day', () => {
    expect(formatDurationMs(6 * 3_600_000)).toBe('6 hours');
    expect(formatDurationMs(1 * 3_600_000)).toBe('1 hour');
  });
  it('rounds to minutes when < 1 hour', () => {
    expect(formatDurationMs(30 * 60_000)).toBe('30 minutes');
    expect(formatDurationMs(60_000)).toBe('1 minute');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun test --isolate src/chores/dueDateConversion.test.ts
```

- [ ] **Step 3: Implement `src/chores/dueDateConversion.ts`**

```ts
import type { Recurrence, RecurrenceFrequency } from '@/types';
import { getWindowStart } from './recurrence';

function dateToYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toFirstDueDate(recurrence: Recurrence): string {
  return dateToYMD(getWindowStart(recurrence, 1));
}

export function firstDueDateToStartDate(
  firstDueDate: string,
  frequency: RecurrenceFrequency,
  interval: number,
  windowStartTime: string,
): string {
  const [y, m, d] = firstDueDate.split('-').map(Number);
  const [h, min] = windowStartTime.split(':').map(Number);
  const date = new Date(y, m - 1, d, h, min, 0, 0);
  switch (frequency) {
    case 'daily':   date.setDate(date.getDate() - interval); break;
    case 'weekly':  date.setDate(date.getDate() - interval * 7); break;
    case 'monthly': date.setMonth(date.getMonth() - interval); break;
  }
  return dateToYMD(date);
}

export function formatDurationMs(ms: number): string {
  const days = ms / 86_400_000;
  if (days >= 1) {
    const rounded = Math.round(days);
    return `${rounded} ${rounded === 1 ? 'day' : 'days'}`;
  }
  const hours = ms / 3_600_000;
  if (hours >= 1) {
    const rounded = Math.round(hours);
    return `${rounded} ${rounded === 1 ? 'hour' : 'hours'}`;
  }
  const minutes = ms / 60_000;
  const rounded = Math.round(minutes);
  return `${rounded} ${rounded === 1 ? 'minute' : 'minutes'}`;
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun test --isolate src/chores/dueDateConversion.test.ts
```

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/chores/dueDateConversion.ts src/chores/dueDateConversion.test.ts
git commit -m "feat: add due-date conversion and duration-formatting utilities"
```

---

## Task 4: WindowBar component

**Files:**
- Create: `src/components/chores/WindowBar.tsx`

- [ ] **Step 1: Create `src/components/chores/WindowBar.tsx`**

```tsx
import { formatDurationMs, formatShortDate } from '@/chores/dueDateConversion';

interface WindowBarProps {
  windowOpenDate: Date;
  firstDueDate: Date;
  duePeriodMs: number;
}

export default function WindowBar({ windowOpenDate, firstDueDate, duePeriodMs }: WindowBarProps) {
  const windowLengthMs = firstDueDate.getTime() - windowOpenDate.getTime();
  if (windowLengthMs <= 0) return null;

  const safedue = Math.min(duePeriodMs, windowLengthMs);
  const upcomingMs = windowLengthMs - safedue;
  const upcomingPct = (upcomingMs / windowLengthMs) * 100;
  const duePct = (safedue / windowLengthMs) * 100;

  const dueStartDate = safedue > 0
    ? new Date(firstDueDate.getTime() - safedue)
    : null;

  return (
    <div className="space-y-1">
      {/* Duration labels above */}
      <div className="flex text-xs text-muted-foreground" style={{ width: '100%' }}>
        {upcomingMs > 0 && (
          <span style={{ width: `${upcomingPct}%` }} className="text-center">
            {formatDurationMs(upcomingMs)}
          </span>
        )}
        <span style={{ width: `${duePct}%` }} className="text-center">
          {formatDurationMs(safedue > 0 ? safedue : windowLengthMs)}
        </span>
      </div>

      {/* Segment bar */}
      <div className="flex w-full h-4 rounded overflow-hidden">
        {upcomingMs > 0 && (
          <div
            className="bg-muted flex items-center justify-center"
            style={{ width: `${upcomingPct}%` }}
            title="Upcoming"
          />
        )}
        <div
          className="bg-yellow-400 dark:bg-yellow-500"
          style={{ width: `${duePct}%` }}
          title="Due"
        />
      </div>

      {/* Section name labels + date anchors */}
      <div className="flex text-xs text-muted-foreground" style={{ width: '100%' }}>
        {upcomingMs > 0 && (
          <span style={{ width: `${upcomingPct}%` }} className="text-center font-medium">
            Upcoming
          </span>
        )}
        <span style={{ width: `${duePct}%` }} className="text-center font-medium">
          Due
        </span>
      </div>

      {/* Date anchors */}
      <div className="relative flex text-xs text-muted-foreground w-full">
        <span className="absolute left-0">{formatShortDate(windowOpenDate)}</span>
        {dueStartDate && (
          <span
            className="absolute"
            style={{ left: `${upcomingPct}%`, transform: 'translateX(-50%)' }}
          >
            {formatShortDate(dueStartDate)}
          </span>
        )}
        <span className="absolute right-0">{formatShortDate(firstDueDate)}</span>
      </div>
      {/* Spacer so date row has height */}
      <div className="h-4" />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chores/WindowBar.tsx
git commit -m "feat: add WindowBar component for visualising window periods"
```

---

## Task 5: XPFormula component

**Files:**
- Create: `src/components/chores/XPFormula.tsx`

- [ ] **Step 1: Create `src/components/chores/XPFormula.tsx`**

```tsx
import type { XPSize, XPSettings } from '@/types';
import { getXPBase } from '@/xp/calculator';
import { toRepetitionFactor } from '@/xp/xpPreview';

interface MultiplierConfig {
  xpPerUnit: number;
}

interface XPFormulaProps {
  xpSize: XPSize | number;
  settings: XPSettings;
  multiplier?: MultiplierConfig;
  streakEnabled: boolean;
  decayEnabled: boolean;
}

function Factor({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-mono text-sm">{value}</span>
      <span className="text-xs text-muted-foreground leading-none">{label}</span>
    </div>
  );
}

function Op({ children }: { children: string }) {
  return <span className="font-mono text-sm pb-4">{children}</span>;
}

export default function XPFormula({
  xpSize,
  settings,
  multiplier,
  streakEnabled,
  decayEnabled,
}: XPFormulaProps) {
  const base = getXPBase(xpSize);
  const streakRange = `1×–${settings.maxStreakMultiplier}×`;
  const decayRange = `${settings.decayFloor}×–1×`;

  return (
    <div className="flex flex-wrap items-end gap-1.5 rounded-md bg-muted/40 px-3 py-2">
      <Factor value="XP" label="" />
      <Op>=</Op>
      <Factor value={String(base)} label="base" />
      {multiplier && (
        <>
          <Op>×</Op>
          <Factor value="ans" label="answer" />
          <Op>÷</Op>
          <Factor value={String(toRepetitionFactor(multiplier.xpPerUnit))} label="rep. factor" />
        </>
      )}
      {streakEnabled && (
        <>
          <Op>×</Op>
          <Factor value={streakRange} label="streak" />
        </>
      )}
      {decayEnabled && (
        <>
          <Op>×</Op>
          <Factor value={decayRange} label="decay" />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chores/XPFormula.tsx
git commit -m "feat: add XPFormula component for displaying XP calculation breakdown"
```

---

## Task 6: ChoreFormModal — first due date label flip + WindowBar

**Files:**
- Modify: `src/components/chores/ChoreFormModal.tsx`

This task renames "Start Date" to "First Due Date" in the form, converts values on load/save, and renders the WindowBar below the Due Period field.

- [ ] **Step 1: Update imports in `ChoreFormModal.tsx`**

Add to the import block:
```ts
import { toFirstDueDate, firstDueDateToStartDate } from '@/chores/dueDateConversion';
import { getWindowStart } from '@/chores/recurrence';
import { duePeriodToMs } from '@/chores/recurrence';
import WindowBar from './WindowBar';
```

- [ ] **Step 2: Update the `startDate` state initialisation**

The stored `startDate` is the window-open date. On load, display `firstDueDate` = window-end = `startDate + interval`.

Replace:
```ts
const [startDate, setStartDate] = useState(chore?.recurrence.startDate ?? todayString());
```
With:
```ts
const initialFirstDueDate = chore
  ? toFirstDueDate(chore.recurrence)
  : (() => {
      // Default: first due date is today + 1 day (daily default)
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
const [firstDueDate, setFirstDueDate] = useState(initialFirstDueDate);
```

Remove the `startDate` state entirely — it will be derived on save.

- [ ] **Step 3: Derive `startDate` for save operations**

In `handleSubmit`, before the `if (isEdit ...)` block, add:
```ts
const startDate = firstDueDateToStartDate(firstDueDate, frequency, Number(interval), windowStartTime);
```

All existing references to `startDate` in the save calls already use this local variable, so they work unchanged.

- [ ] **Step 4: Update form field — rename label and wire new state**

Replace the existing Start Date `<div>`:
```tsx
<div className="space-y-2">
  <Label htmlFor="chore-start-date">First Due Date <span className="text-destructive">*</span></Label>
  <Input
    id="chore-start-date"
    type="date"
    value={firstDueDate}
    onChange={(e) => setFirstDueDate(e.target.value)}
    className={errors.startDate ? 'border-destructive' : ''}
  />
  {errors.startDate && <p className="text-xs text-destructive">{errors.startDate}</p>}
  <p className="text-xs text-muted-foreground">
    When is this chore first due? The first window opens one {frequency} before this date.
  </p>
</div>
```

- [ ] **Step 5: Update validation to reference `firstDueDate`**

In `validate()`, replace:
```ts
if (!startDate) { errs.startDate = 'Start date is required.'; }
else if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) { errs.startDate = 'Start date must be in YYYY-MM-DD format.'; }
```
With:
```ts
if (!firstDueDate) { errs.startDate = 'First due date is required.'; }
else if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDueDate)) { errs.startDate = 'First due date must be in YYYY-MM-DD format.'; }
```

- [ ] **Step 6: Add WindowBar below the Due Period field**

After the closing `</div>` of the Due Period section, add:

```tsx
{firstDueDate && /^\d{4}-\d{2}-\d{2}$/.test(firstDueDate) && Number(interval) >= 1 && (() => {
  const startDate = firstDueDateToStartDate(firstDueDate, frequency, Number(interval), windowStartTime);
  const recurrence = { frequency, interval: Number(interval), startDate, windowStartTime };
  const windowOpen = getWindowStart(recurrence, 0);
  const firstDue = getWindowStart(recurrence, 1);
  const duePeriodMsVal = duePeriodValue.trim() && Number(duePeriodValue) > 0
    ? duePeriodToMs({ value: Number(duePeriodValue), unit: duePeriodUnit })
    : 0;
  return (
    <WindowBar
      windowOpenDate={windowOpen}
      firstDueDate={firstDue}
      duePeriodMs={duePeriodMsVal}
    />
  );
})()}
```

- [ ] **Step 7: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/components/chores/ChoreFormModal.tsx
git commit -m "feat: rename Start Date to First Due Date with window bar visualisation"
```

---

## Task 7: ChoreFormModal — score multiplier section + XPFormula

**Files:**
- Modify: `src/components/chores/ChoreFormModal.tsx`
- Modify: `src/components/questions/QuestionFormFields.tsx`

- [ ] **Step 1: Remove MULTIPLIER from `QuestionFormFields.tsx`**

In `src/components/questions/QuestionFormFields.tsx`, the `allTypes` array on line 52 currently adds MULTIPLIER:
```ts
const allTypes = [...QUESTION_TYPES, { value: 'MULTIPLIER' as QuestionType, label: 'Score Multiplier' }];
```
Change to:
```ts
const allTypes = QUESTION_TYPES;
```

Also remove the `MULTIPLIER` branch from `handleTypeChange` (the `else if (newType === 'MULTIPLIER') ...` line) and the `{question.type === 'MULTIPLIER' && (...)}` rendering block at the bottom.

Remove the now-unused `isMultiplierDisabled` variable and `hasOtherMultiplier` prop:
- Remove `hasOtherMultiplier?: boolean` from the `Props` interface
- Remove `const isMultiplierDisabled = ...` line
- Remove the `disabled={...}` prop from the SelectItem rendering

Remove unused imports: `buildMultiplierXPPreview`, `toRepetitionFactor` (if no longer used in this file).

- [ ] **Step 2: Add multiplier state + imports to `ChoreFormModal.tsx`**

Add imports:
```ts
import XPFormula from './XPFormula';
import type { MultiplierQuestion } from '@/types';
```

Add state (after the existing state declarations):
```ts
// Find any existing multiplier question for this chore
const existingMultiplier = initialQuestions.find((q): q is MultiplierQuestion => q.type === 'MULTIPLIER');

const [multiplierEnabled, setMultiplierEnabled] = useState(!!existingMultiplier);
const [multiplierPrompt, setMultiplierPrompt] = useState(existingMultiplier?.prompt ?? '');
const [multiplierXpPerUnit, setMultiplierXpPerUnit] = useState(existingMultiplier?.xpPerUnit ?? 1);
const [multiplierAnswerType, setMultiplierAnswerType] = useState<'integer' | 'float'>(
  existingMultiplier?.multiplierAnswerType ?? 'integer'
);
```

- [ ] **Step 3: Filter multiplier from QuestionBuilder's initial questions**

Update `initialQuestions` passed to `QuestionBuilder`. Find the `<QuestionBuilder>` usage and update:
```tsx
<QuestionBuilder
  choreKey={isEdit ? chore!.key : ''}
  initialQuestions={isEdit ? initialQuestions.filter(q => q.type !== 'MULTIPLIER') : []}
  onChange={setQuestionDrafts}
/>
```

- [ ] **Step 4: Synthesise multiplier into question drafts on save**

In `handleSubmit`, after the `validate()` block and before the existing save logic, add:

```ts
const multiplierDraft: MultiplierQuestion | null = multiplierEnabled && multiplierPrompt.trim()
  ? {
      id: existingMultiplier?.id ?? crypto.randomUUID(),
      choreKey: '',       // will be set below when saving
      prompt: multiplierPrompt.trim(),
      required: true,
      order: -1,          // will sort before other questions (or append after)
      type: 'MULTIPLIER',
      xpPerUnit: multiplierXpPerUnit,
      multiplierAnswerType: multiplierAnswerType,
    }
  : null;
```

Then when calling `saveQuestions`, merge the multiplier back in:
```ts
const allDrafts = [
  ...questionDrafts.filter(d => d.type !== 'MULTIPLIER'),
  ...(multiplierDraft ? [multiplierDraft] : []),
];
await saveQuestions(activeChoreKey, allDrafts.map((d) => ({ ...d, choreKey: activeChoreKey })));
```

Apply this to both the edit and create branches (replace both `saveQuestions` calls).

Add validation: in `validate()`, add:
```ts
if (multiplierEnabled && !multiplierPrompt.trim()) {
  errs.questions = 'Score multiplier requires a prompt.';
}
```

- [ ] **Step 5: Render the Score Multiplier section in the form**

Insert this block directly after the XP Size `<div>` (after the `{xpPreview && ...}` line), before the Frequency field:

```tsx
<div className="space-y-2">
  <div className="flex items-center gap-3">
    <input
      id="multiplier-enabled"
      type="checkbox"
      checked={multiplierEnabled}
      onChange={(e) => setMultiplierEnabled(e.target.checked)}
      className="h-4 w-4 rounded border-input accent-primary"
    />
    <Label htmlFor="multiplier-enabled" className="font-normal">Score Multiplier</Label>
  </div>
  {multiplierEnabled && (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3 ml-7">
      <div className="space-y-1">
        <Label className="text-xs">Prompt <span className="text-destructive">*</span></Label>
        <Input
          value={multiplierPrompt}
          onChange={(e) => setMultiplierPrompt(e.target.value)}
          placeholder="e.g. How many reps did you do?"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Repetition Factor</Label>
        <Input
          type="number"
          min="1"
          step="1"
          value={Math.max(1, Math.round(1 / multiplierXpPerUnit))}
          onChange={(e) => {
            const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
            setMultiplierXpPerUnit(1 / n);
          }}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Answer type</Label>
        <div className="flex gap-4">
          {(['integer', 'float'] as const).map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                checked={multiplierAnswerType === t}
                onChange={() => setMultiplierAnswerType(t)}
                className="accent-primary"
              />
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </label>
          ))}
        </div>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 6: Render XPFormula below the multiplier section**

Immediately after the multiplier `</div>`, before the Frequency field, add:

```tsx
{activeSettings && (() => {
  const selectedPack = packs.find(p => p.id === selectedPackId);
  return (
    <XPFormula
      xpSize={effectiveXpSize}
      settings={activeSettings}
      multiplier={multiplierEnabled ? { xpPerUnit: multiplierXpPerUnit } : undefined}
      streakEnabled={selectedPack?.manifest.streak ?? true}
      decayEnabled={selectedPack?.manifest.decay ?? true}
    />
  );
})()}
```

Note: `effectiveXpSize` is defined in Task 8 (custom XP). For now use `xpSize` — it will be unified in the next task.

- [ ] **Step 7: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/components/chores/ChoreFormModal.tsx src/components/questions/QuestionFormFields.tsx
git commit -m "feat: move score multiplier to dedicated chore field and add XP formula display"
```

---

## Task 8: ChoreFormModal — custom XP size

**Files:**
- Modify: `src/components/chores/ChoreFormModal.tsx`

- [ ] **Step 1: Update xpSize state and XP_SIZES constant**

The existing `xpSize` state is `XPSize`. Extend it:

Replace:
```ts
const [xpSize, setXpSize] = useState<XPSize>(chore?.xpSize ?? 'S');
```
With:
```ts
const initialXpSize = chore?.xpSize ?? 'S';
const [xpSize, setXpSize] = useState<XPSize | number>(
  typeof initialXpSize === 'number' ? 'CUSTOM' as XPSize : initialXpSize
);
const [customXPValue, setCustomXPValue] = useState<string>(
  typeof initialXpSize === 'number' ? String(initialXpSize) : '1'
);
const isCustomXP = xpSize === ('CUSTOM' as string);
```

Add a derived value used in save + formula:
```ts
const effectiveXpSize: XPSize | number = isCustomXP
  ? (Math.max(1, Math.floor(Number(customXPValue) || 1)))
  : xpSize as XPSize;
```

- [ ] **Step 2: Update the XP Size dropdown to include Custom…**

Replace the existing XP Size `<Select>`:
```tsx
<div className="space-y-2">
  <Label htmlFor="chore-xp-size">XP Size</Label>
  {isCustomXP ? (
    <div className="flex gap-2">
      <Input
        type="number"
        min="1"
        step="1"
        value={customXPValue}
        onChange={(e) => setCustomXPValue(e.target.value)}
        className="w-28"
        placeholder="e.g. 15"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => { setXpSize('S'); setCustomXPValue('1'); }}
      >
        Use preset
      </Button>
    </div>
  ) : (
    <Select
      value={xpSize as string}
      onValueChange={(v) => {
        if (v === 'CUSTOM') { setXpSize('CUSTOM' as XPSize); }
        else { setXpSize(v as XPSize); }
      }}
    >
      <SelectTrigger id="chore-xp-size">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {XP_SIZES.map((size) => (
          <SelectItem key={size} value={size}>
            {size} ({XP_BASE[size]} XP)
          </SelectItem>
        ))}
        <SelectItem value="CUSTOM">Custom…</SelectItem>
      </SelectContent>
    </Select>
  )}
  {xpPreview && <p className="text-xs text-primary">{xpPreview}</p>}
</div>
```

- [ ] **Step 3: Update `xpPreview` to use `effectiveXpSize`**

Replace:
```ts
const xpPreview = activeSettings ? buildXPPreview(xpSize, activeSettings) : null;
```
With:
```ts
const xpPreview = activeSettings ? buildXPPreview(effectiveXpSize, activeSettings) : null;
```

- [ ] **Step 4: Update save calls to use `effectiveXpSize`**

In both `updateChore` and `addChore` calls inside `handleSubmit`, replace `xpSize` with `effectiveXpSize` in the spread:

```ts
await updateChore({ ...chore, ..., xpSize: effectiveXpSize, ... });
// and
const newChoreKey = await addChore({ ..., xpSize: effectiveXpSize, ... });
```

- [ ] **Step 5: Remove now-unused `XP_BASE` import if no longer directly used**

Check whether `XP_BASE` is still referenced in `ChoreFormModal.tsx` (it is, in the `XP_SIZES.map` dropdown label). If so, keep the import; otherwise remove it.

- [ ] **Step 6: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/components/chores/ChoreFormModal.tsx
git commit -m "feat: allow custom integer XP size in chore form"
```

---

## Task 9: ChoreFormModal — default XP size from pack

**Files:**
- Modify: `src/components/chores/ChoreFormModal.tsx`

- [ ] **Step 1: Pre-fill `xpSize` from the pack's `defaultXPSize`**

The `packs` array is already available in `ChoreFormModal`. Update the `initialXpSize` derivation (from Task 8):

```ts
const pack = packs.find(p => p.id === packId);
const packDefault = pack?.manifest.defaultXPSize ?? 'S';
const initialXpSize = chore?.xpSize ?? packDefault;
```

No other changes needed — the rest of the Task 8 state setup already reads from `initialXpSize`.

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chores/ChoreFormModal.tsx
git commit -m "feat: pre-fill XP size from pack default when creating a chore"
```

---

## Task 10: PackOptionsModal component

**Files:**
- Create: `src/components/packs/PackOptionsModal.tsx`

- [ ] **Step 1: Create `src/components/packs/PackOptionsModal.tsx`**

```tsx
import { useState } from 'react';
import { useAppStore } from '@/store';
import type { Pack, XPSize } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { MarkdownEditor } from '@/components/ui/MarkdownEditor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { XP_BASE, getXPBase } from '@/xp/calculator';

const XP_SIZES: XPSize[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

interface Props {
  pack: Pack;
  onClose: () => void;
}

export default function PackOptionsModal({ pack, onClose }: Props) {
  const updatePackManifest = useAppStore((s) => s.updatePackManifest);

  const [title, setTitle] = useState(pack.manifest.title);
  const [description, setDescription] = useState(pack.manifest.description ?? '');
  const [streak, setStreak] = useState(pack.manifest.streak ?? true);
  const [decay, setDecay] = useState(pack.manifest.decay ?? true);
  const [xpTarget, setXpTarget] = useState(
    pack.manifest.xpTarget != null ? String(pack.manifest.xpTarget) : ''
  );
  const [targetDate, setTargetDate] = useState(pack.manifest.targetDate ?? '');
  const [allowShiftOnImport, setAllowShiftOnImport] = useState(
    pack.manifest.allowShiftOnImport ?? false
  );

  // Default XP size
  const initialDefaultXP = pack.manifest.defaultXPSize;
  const [defaultXPSize, setDefaultXPSize] = useState<XPSize | 'CUSTOM'>(
    typeof initialDefaultXP === 'number' ? 'CUSTOM'
      : initialDefaultXP ?? ('' as XPSize)
  );
  const [customDefaultXP, setCustomDefaultXP] = useState(
    typeof initialDefaultXP === 'number' ? String(initialDefaultXP) : ''
  );
  const isCustomDefaultXP = defaultXPSize === 'CUSTOM';

  const [titleError, setTitleError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    if (!title.trim()) { setTitleError('Title is required.'); return; }
    setTitleError('');
    setSubmitting(true);

    const xpTargetVal = xpTarget.trim() ? Number(xpTarget) : undefined;
    const targetDateVal = targetDate.trim() || undefined;

    let defaultXPSizeVal: XPSize | number | undefined;
    if (isCustomDefaultXP && customDefaultXP.trim()) {
      defaultXPSizeVal = Math.max(1, Math.floor(Number(customDefaultXP) || 1));
    } else if (!isCustomDefaultXP && defaultXPSize) {
      defaultXPSizeVal = defaultXPSize as XPSize;
    }

    await updatePackManifest(pack.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      streak,
      decay,
      xpTarget: xpTargetVal,
      targetDate: targetDateVal,
      allowShiftOnImport,
      defaultXPSize: defaultXPSizeVal,
    });
    setSubmitting(false);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pack Options</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Details */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Details</h3>
            <div className="space-y-1">
              <Label htmlFor="pack-title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="pack-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={titleError ? 'border-destructive' : ''}
              />
              {titleError && <p className="text-xs text-destructive">{titleError}</p>}
            </div>
            <div className="space-y-1">
              <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <MarkdownEditor value={description} onChange={setDescription} />
            </div>
          </section>

          {/* Scoring */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Scoring</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="pack-streak" className="font-normal">Streaks enabled</Label>
              <Switch id="pack-streak" checked={streak} onCheckedChange={setStreak} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="pack-decay" className="font-normal">Decay enabled</Label>
              <Switch id="pack-decay" checked={decay} onCheckedChange={setDecay} />
            </div>
            <div className="space-y-1">
              <Label>Default XP size <span className="text-muted-foreground font-normal">(optional)</span></Label>
              {isCustomDefaultXP ? (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={customDefaultXP}
                    onChange={(e) => setCustomDefaultXP(e.target.value)}
                    className="w-28"
                    placeholder="e.g. 15"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { setDefaultXPSize('' as XPSize); setCustomDefaultXP(''); }}
                  >
                    Use preset
                  </Button>
                </div>
              ) : (
                <Select
                  value={defaultXPSize as string}
                  onValueChange={(v) => {
                    if (v === 'CUSTOM') setDefaultXPSize('CUSTOM');
                    else setDefaultXPSize(v as XPSize);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {XP_SIZES.map((size) => (
                      <SelectItem key={size} value={size}>
                        {size} ({XP_BASE[size]} XP)
                      </SelectItem>
                    ))}
                    <SelectItem value="CUSTOM">Custom…</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="pack-xp-target">XP target <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="pack-xp-target"
                type="number"
                min="1"
                value={xpTarget}
                onChange={(e) => setXpTarget(e.target.value)}
                placeholder="e.g. 1000"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pack-target-date">Target date <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="pack-target-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          </section>

          {/* Import */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Import</h3>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="pack-shift" className="font-normal">Allow shift on import</Label>
                <p className="text-xs text-muted-foreground">Offer date shifting when this pack is imported</p>
              </div>
              <Switch id="pack-shift" checked={allowShiftOnImport} onCheckedChange={setAllowShiftOnImport} />
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Fix any import errors (check that `Switch` exists in the UI library — if not, use a checkbox with the same pattern as in `ChoreFormModal`).

- [ ] **Step 3: Commit**

```bash
git add src/components/packs/PackOptionsModal.tsx
git commit -m "feat: add PackOptionsModal with details, scoring, and import settings"
```

---

## Task 11: PackDashboard — slim kebab + wire PackOptionsModal

**Files:**
- Modify: `src/components/packs/PackDashboard.tsx`

- [ ] **Step 1: Import PackOptionsModal**

Add to imports in `PackDashboard.tsx`:
```ts
import PackOptionsModal from './PackOptionsModal';
```

- [ ] **Step 2: Add modal open state**

After the existing state declarations, add:
```ts
const [optionsOpen, setOptionsOpen] = useState(false);
```

- [ ] **Step 3: Remove kebab menu items that move to the modal**

In the kebab/dropdown menu, remove:
- "Streaks enabled" `<DropdownMenuCheckboxItem>`
- "Allow shift on import" `<DropdownMenuCheckboxItem>`
- "Set XP target…" `<DropdownMenuItem>`
- "Set target date…" `<DropdownMenuItem>`
- Any inline state and handlers for `isRenaming`, `xpTargetInput`, `targetDateInput`, description editing (all now live in the modal)

Keep only:
- **Options…** (new item, opens modal)
- **Download as CDP**
- **Delete Pack**

Replace those removed items with:
```tsx
<DropdownMenuItem onClick={() => setOptionsOpen(true)}>
  Options…
</DropdownMenuItem>
```

- [ ] **Step 4: Remove now-unused state and inline editing UI**

Remove from `PackDashboard.tsx`:
- `const [isRenaming, setIsRenaming] = useState(false);`
- `const [renameValue, setRenameValue] = useState('');`
- `const [descriptionValue, setDescriptionValue] = useState('');`
- `const [isEditingDescription, setIsEditingDescription] = useState(false);`
- `const [xpTargetInput, setXpTargetInput] = useState('');`
- `const [targetDateInput, setTargetDateInput] = useState('');`
- The `updatePackDescription` store subscription
- All JSX blocks for inline rename, inline description edit, XP target input, target date input

Keep the pack title `<h1>`, description `<MarkdownDisplay>`, and progress bars — these are display-only and remain in PackDashboard.

- [ ] **Step 5: Render PackOptionsModal**

At the bottom of the component's return, before the closing fragment tag, add:
```tsx
{optionsOpen && pack && (
  <PackOptionsModal pack={pack} onClose={() => setOptionsOpen(false)} />
)}
```

- [ ] **Step 6: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 7: Run all tests**

```bash
bun run test
```

- [ ] **Step 8: Commit**

```bash
git add src/components/packs/PackDashboard.tsx
git commit -m "feat: consolidate pack settings into PackOptionsModal"
```

---

## Self-review checklist

- **Spec §1a (First Due Date label flip):** Task 6 ✓
- **Spec §1b (Window bar):** Tasks 3 + 4 + 6 ✓
- **Spec §2a (Multiplier as dedicated field):** Task 7 ✓
- **Spec §2b (Formula display):** Task 5 + 7 ✓
- **Spec §3a (Decay toggle):** Tasks 1 + 2 + 10 + 11 ✓
- **Spec §3b (Default XP per pack):** Tasks 1 + 9 + 10 ✓
- **Spec §4 (Custom XP size + getXPBase):** Tasks 1 + 8 ✓
- **Spec §5 (Pack options modal, all 3 sections):** Tasks 10 + 11 ✓
- **Out-of-scope (calendar UI, rename field):** Not in plan ✓
