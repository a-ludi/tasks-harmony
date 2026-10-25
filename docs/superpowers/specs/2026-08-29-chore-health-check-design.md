# Chore Health Check Design

**Date:** 2026-08-29
**Status:** Approved

## Overview

Chores with targets can accumulate data integrity issues over time. This feature detects those issues per-chore, surfaces a non-obtrusive warning to the user, and offers a guided auto-fix dialog.

## Failure Modes

Four issue kinds are addressed:

| Kind | User-facing? | Description |
|------|-------------|-------------|
| `duplicate-targets` | Yes | Two or more targets share identical answer fingerprints |
| `unmatched-completion` | Yes | A completion's answers exactly match a target but no `targetId` is set |
| `orphaned-target-ref` | Yes | A completion's `targetId` points to a target that no longer exists |
| Stale question refs | No (silent) | A target has answers for question IDs no longer on the chore |

A fifth potential failure mode (completions linked to targets of a different `choreKey`) is out of scope for now.

## Issue Types

```typescript
type ChoreIssue =
  | { kind: 'duplicate-targets';    groups: DuplicateGroup[] }
  | { kind: 'unmatched-completion'; completionId: string; targetId: string }
  | { kind: 'orphaned-target-ref';  completionId: string }

interface DuplicateGroup {
  keep: Target;     // survivor: most completions wins, ties broken by id sort
  remove: Target[]; // references redirected to keep, then deleted
}
```

## Detection Logic

**File:** `src/chores/healthCheck.ts`

Two pure functions with no React or store dependencies:

```typescript
function detectChoreIssues(
  choreKey: string,
  targets: Target[],
  completions: Completion[],
  questions: Question[],
): ChoreIssue[]

function detectStaleTargets(
  targets: Target[],
  questions: Question[],
): Target[]   // targets that have at least one answer for a deleted question ID
```

The hook calls both. `detectStaleTargets` results feed the silent `useEffect` fix only and are never shown to the user.

**Answer fingerprinting:** Serialize a target's or completion's answers as a canonically sorted string — answers sorted by `questionId`, joined as `questionId:value` pairs, considering only the question IDs present in `questions`. This ensures stale question refs don't affect duplicate detection.

**Four passes in order:**

1. **Duplicate targets** — group targets by fingerprint; any group with >1 member produces one `duplicate-targets` issue. The `keep` target is the one with the most linked completions; ties broken by `id` ascending.

2. **Unmatched completions** — for each completion with no `targetId`, fingerprint its answers against the current `questions`; if a target fingerprint matches, emit `unmatched-completion`.

3. **Orphaned refs** — for each completion with a `targetId`, if that id is not in `targets`, emit `orphaned-target-ref`.

4. **Stale question refs** — handled by `detectStaleTargets`, not `detectChoreIssues`. Called separately by the hook's `useEffect` for silent auto-fix.

## Hook

**File:** `src/hooks/useChoreIssues.ts`

```typescript
function useChoreIssues(choreKey: string): {
  issues: ChoreIssue[];
  hasIssues: boolean;
}
```

- Reads `targets`, `completions`, `questions` slices from the Zustand store filtered to `choreKey`
- `useMemo` runs `detectChoreIssues` — recomputes only when those slices change
- `useMemo` also runs `detectStaleTargets` — result feeds a `useEffect` for silent auto-fix
- `useEffect` (dependent on stale targets result): if non-empty, calls `saveTargets` with those targets' answers stripped to only known question IDs. Fires on mount and whenever `questions` changes.

## UI Components

### `ChoreHealthTooltip`

Wraps the chore title area. Renders nothing when `hasIssues` is false.

When issues exist, renders a `TriangleAlert` icon (from `lucide-react`) inline next to the title. The icon is wrapped in a Radix `Tooltip` whose content shows:

- One summary line per issue kind present (e.g. "2 duplicate targets", "1 unmatched completion", "1 orphaned link")
- A "Fix issues" button at the bottom

Clicking "Fix issues" sets local state to open `ChoreFixDialog`. The dialog renders outside the tooltip so the tooltip closing on click has no effect.

### `ChoreFixDialog`

A Radix `Dialog` listing each fixable issue as a row:

- Checkbox (checked by default) — uncheck to opt out of this fix
- Human-readable description of the issue and what the fix will do
- For `unmatched-completion`: shows which completion date and which target label will be linked

"Apply fixes" button runs checked fixes in sequence, shows a loading state during async store calls, then closes. The `useMemo` in `useChoreIssues` recomputes from updated store state; the badge disappears automatically if no issues remain.

### Placement

`ChoreHealthTooltip` is placed inline next to the chore title in:
- Chore list items
- Chore edit modal header

Both locations use the same component. No surrounding layout changes are needed beyond inserting the component.

## Store Changes

One new action added to the Zustand store:

```typescript
patchCompletionTargetId(completionId: string, targetId: string | undefined): Promise<void>
```

Updates `targetId` on the completion in IndexedDB and Zustand state. Used for both redirecting (duplicate target merging) and unlinking (orphaned refs).

### Fix execution per issue kind

| Issue | Store calls |
|-------|-------------|
| `duplicate-targets` | `patchCompletionTargetId` for each completion on `remove` targets → `keep.id`; then `saveTargets` with `remove` targets marked `_deleted` |
| `unmatched-completion` | `linkCompletionToTarget(completionId, targetId)` (existing) |
| `orphaned-target-ref` | `patchCompletionTargetId(completionId, undefined)` |

## Testing

### `src/chores/healthCheck.test.ts`

Unit tests for `detectChoreIssues`. Pure function, no framework setup needed. Cases:

- No issues → empty array
- Two targets with identical answer fingerprints → correct `duplicate-targets` group with right `keep`/`remove` split
- Completion matching a target fingerprint but no `targetId` → `unmatched-completion`
- Completion with nonexistent `targetId` → `orphaned-target-ref`
- Multiple issue kinds in one call
- Target with stale question ref answers → not in returned issues (separate return value for silent fix)

### `ChoreFixDialog` integration test

Vitest + testing-library: verify that unchecking a fix row excludes the corresponding store call when "Apply" is clicked.

`useChoreIssues` is not unit-tested separately — logic lives in the pure function.

## File Map

```
src/chores/healthCheck.ts          — detectChoreIssues + detectStaleTargets pure functions
src/chores/healthCheck.test.ts     — unit tests
src/hooks/useChoreIssues.ts        — React hook (useMemo + silent fix effect)
src/components/chores/ChoreHealthTooltip.tsx  — warning icon + Radix Tooltip
src/components/chores/ChoreFixDialog.tsx      — fix dialog with opt-out rows
src/store/index.ts                 — add patchCompletionTargetId action
```
