# Chore Form UX Improvements — Design Spec

**Date:** 2026-06-29
**Branch:** sprint/encrypted-sync

---

## Overview

Six improvements to the chore and pack editing experience, addressing scheduling intuitiveness, scoring transparency, XP flexibility, and pack management ergonomics. A seventh item (calendar-like scheduling interface) is out of scope and tracked as a GitHub issue.

---

## 1. Scheduling UX

### 1a. "First Due Date" label flip

The form field currently labelled **"Start Date"** is relabelled **"First Due Date"**. The semantics flip in the UI only — the underlying `startDate` field in `Recurrence` continues to store the window-open date unchanged.

- **On load:** displayed value = `stored_startDate + interval` (the end of the first window / first due date)
- **On save:** `stored_startDate = input − interval`
- **Help text:** *"When is this chore first due? The first window opens one [frequency] before this date."*

No data migration required.

### 1b. Window bar

A full-width proportional bar appears below the Due Period field whenever a valid first due date and frequency are set. It represents one complete window and has **one or two segments**:

| Condition | Segments |
|---|---|
| No due period | Single yellow **"Due"** bar spanning the full window |
| Due period set | Gray **"Upcoming"** + Yellow **"Due"**, proportional to `(window_length − due_period)` and `due_period` |

Each segment has its **duration** as a label above it (e.g. "5 days", "2 days").

Below the bar, three date anchors are shown at their corresponding horizontal positions:

- **Left edge:** window open date
- **Junction** (upcoming/due boundary): due-start date — only shown when a due period is set
- **Right edge:** first due date (= window close)

---

## 2. Scoring UX

### 2a. Score multiplier as dedicated chore field

The `MULTIPLIER` question type is removed from the type selector in `QuestionFormFields`. In `ChoreFormModal`, a dedicated collapsible **"Score Multiplier"** section appears directly below the XP Size field. It contains:

- **Enable toggle** — on/off
- **Prompt** — the question shown to the user at completion time (required when enabled)
- **Repetition Factor** — existing number input (rename deferred to a separate task)
- **Answer type** — integer / float radio

**Data flow (no model change):**
- On load: if the chore has a `MultiplierQuestion` in the questions array, its values pre-populate the section and the toggle is on
- On save: when enabled, synthesises a `MultiplierQuestion` into the questions array; when disabled, removes any existing `MultiplierQuestion`

### 2b. Formula display

A read-only formula block appears below the score multiplier section. Each factor is rendered as a small vertical block — value/range on top, shorthand label below — separated by operators. The `×` operator is integrated into each optional factor's value (e.g. `× 1–3` with label "streak"). When any multiplier is active (streak, decay, or question multiplier), the formula wraps in `round(...)`.

**Without multipliers active:**
```
XP  =   8
       base
```

**With only decay/streak active (round wraps):**
```
XP  =  round(   8    × 1–3    × 50%–100% )
              base    streak    decay
```

**With multiplier question enabled:**
```
XP  =  round(   8    ×   ans   ÷    2     × 1–3    × 50%–100% )
              base    answer   rep.fac.   streak    decay
```

- Ranges come from active `XPSettings`: streak shows as `"1–N"` (N = `maxStreakMultiplier`), decay shows as `"F%–100%"` (F = `decayFloor × 100`, rounded)
- `ans` is a placeholder — the actual answer is only known at completion time
- **Streak factor is hidden** when the pack has `streak: false`
- **Decay factor is hidden** when the pack has `decay: false`

---

## 3. Pack settings

### 3a. Decay factor toggle

`PackManifest` gains `decay?: boolean` (default `true`), mirroring the existing `streak` field.

- A **"Decay enabled"** toggle appears in the pack options modal (Section 5) alongside "Streaks enabled"
- When `false`, `decayMult` is treated as `1` in `calculateXP` and the decay factor is hidden from the formula display

### 3b. Default XP size per pack

`PackManifest` gains `defaultXPSize?: XPSize | number`.

- **"Default XP size"** is configurable in the pack options modal (Section 5) under Scoring
- When a new chore is created within a pack that has `defaultXPSize` set, the XP size field pre-fills with that value instead of the hardcoded `'S'`

---

## 4. Custom XP size

### Type change

`Chore.xpSize` changes from `XPSize` to `XPSize | number`. A `number` value means a custom positive integer XP amount.

### Helper function

A single helper replaces all direct `XP_BASE[xpSize]` lookups:

```ts
function getXPBase(xpSize: XPSize | number): number {
  return typeof xpSize === 'number' ? xpSize : XP_BASE[xpSize];
}
```

All call sites in `calculator.ts`, `xpPreview.ts`, and `ChoreFormModal.tsx` use `getXPBase` instead.

### Form UX

The XP size `<Select>` gains a **"Custom…"** option at the bottom. Selecting it replaces the dropdown with a number input (positive integer, min 1). Switching back to a preset restores the dropdown. The XP preview and formula display update live in both modes.

`PackManifest.defaultXPSize` also accepts `XPSize | number` for consistency with custom values.

---

## 5. Pack options modal

The pack kebab menu is reduced to three items: **Options…**, **Download as CDP**, **Delete Pack**.

"Options…" opens a modal with three sections:

### Details
- **Title** — editable text field (required)
- **Description** — editable markdown field (optional)

### Scoring
- Streaks enabled (toggle)
- Decay enabled (toggle)
- Default XP size (input)
- XP target (input)
- Target date (date input)

### Import
- Allow shift on import (toggle)

All existing behaviour of the individual kebab actions is preserved; they are simply consolidated into one place. The "Download as CDP" and "Delete Pack" actions remain directly in the kebab menu as they are destructive/export actions that don't belong in a settings modal.

---

## Out of scope

- Calendar-like interface for selecting scheduling dates (track as GitHub issue)
- Rename of "Repetition Factor" field (deferred to a separate task)
