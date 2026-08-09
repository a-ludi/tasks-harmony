# Targets Bug Fixes Design

**Date:** 2026-08-09
**Scope:** 7 bugs related to targets in the chore edit modal and chore details page.

## Bug 1 — Remove target ordering UI; sort by question answers

**File:** `src/components/chores/TargetBuilder.tsx`

The ↑/↓ reorder buttons (`moveUp`, `moveDown`) are misleading: the `order` field on `Target` is set but not reliably meaningful. Remove:
- `moveUp` and `moveDown` functions
- The `<div className="flex flex-col">` containing the two arrow buttons in the draft list rows

Replace the manual ordering with deterministic sort: sort `activeDrafts` by question answer values in question-order sequence (first question is primary key, second is secondary, etc.). Use the same `compareValues` logic used elsewhere in the app (numeric for numbers, string comparison otherwise, null sorts last).

## Bug 2 — Exclude would-be-duplicate completions from Add Target list

**File:** `src/components/chores/TargetBuilder.tsx`

`unlinkedCompletions` currently excludes completions already linked to a target or active draft. Additionally exclude any completion whose answer values for **all chore questions** exactly match an existing active draft:
- For every chore question, compare the completion's answer value to the draft's answer value for that question
- Null == null counts as equal; a null value is not equal to a non-null value
- If all questions match → the completion is excluded

## Bug 3 — Include targets in grouped view of ChorePage

**File:** `src/components/chores/ChorePage.tsx`

When `groupBys` is active, `groupCompletions` distributes `Completion[]` into groups. Pending targets are currently appended ungrouped at the bottom.

Fix: add a `groupTargets(targets, groupBys, questions)` helper to `src/components/chores/completionsTable.ts` (parallel to `groupCompletions`) that distributes `Target[]` into the same group key space using the same exact-match logic:
- For each groupBy question, look up the target's answer value for that question
- Build the composite key the same way `groupCompletions` does
- Targets with null for a group question land in the null-keyed group (same as completions)

When rendering groups, merge the two maps. Each group header caption shows:
- `N completion(s) · M target(s)` when both are present
- `N completion(s)` when no targets in that group
- `M target(s)` when no completions in that group

Within an open group, render target rows (with `—` in the "completed at" cell and `—` in the XP column) after the completion rows, styled with `opacity-40` as in the ungrouped case.

## Bug 4 — Restore totals row below the table in ChorePage

**File:** `src/components/chores/ChorePage.tsx`

`CompletionsTable.tsx` has a `<tfoot>` with completion count and XP sum. `ChorePage.tsx` lost this when it was rewritten. Add back a `<tfoot>` block:
- Use `computeTotals(completions, choreQuestions)` for XP and question sums
- "Completed at" cell shows:
  - `"N completion(s) · M target(s)"` when `showTargets && pendingTargets.length > 0`
  - `"N completion(s)"` otherwise
- XP sum cell shows completions-only XP total
- Question sum cells show question sums (numeric questions only, `—` for non-numeric)

## Bug 5 — Add target progress bar to ChorePage

**File:** `src/components/chores/ChorePage.tsx`

`ChoreCard.tsx` shows a target progress bar when targets exist. `ChorePage.tsx` does not.

Add the progress bar above the toolbar (below the "Completion History" `h2`), when `targets.length > 0`. Use the shared `TargetProgressBar` component extracted in Bug 6.

Show: label row with "Target progress" on the left and count/done badge on the right, then the bar.

## Bug 6 — Extract shared TargetProgressBar component; use indigo-400

**Files:** new `src/components/chores/TargetProgressBar.tsx`, `src/components/dashboard/ChoreCard.tsx`, `src/components/chores/ChorePage.tsx`

Extract the inline progress bar JSX from `ChoreCard.tsx` (lines 97–118) into a standalone component:

```
TargetProgressBar({ done: number; total: number; compact?: boolean })
```

- Progress fill color: `bg-indigo-400` (replaces `bg-green-500`)
- When `compact`: omit the label row, show only the bar with a `title` attribute
- When not compact: show label row ("Target progress" left, count or "Completed" badge right) + bar

Both `ChoreCard.tsx` and `ChorePage.tsx` use this component.

## Bug 7 — Use question order for answer labels in target edit list

**File:** `src/components/chores/TargetBuilder.tsx`

The `summarise` function iterates `questions` to build the label string. If `questions` arrives unsorted, labels show answers in arbitrary order. Fix: sort `questions` by `q.order` at the top of the component (before any usage), so `summarise` and the draft list sort (Bug 1) both operate on a consistently ordered question array.
