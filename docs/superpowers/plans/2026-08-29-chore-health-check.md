# Chore Health Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect data integrity issues in chores with targets (duplicates, unmatched completions, orphaned links, stale question refs) and surface per-chore fix UI via a warning icon + Radix Tooltip + fix dialog.

**Architecture:** A pure detection module (`src/chores/healthCheck.ts`) feeds a `useChoreIssues` hook that runs `useMemo` for detection and `useEffect` for silent auto-fix of stale question refs. A `ChoreHealthTooltip` component (calling the hook internally) is dropped next to the chore title in both `ChoreCard` and `ChoreFormModal`. Fixes are executed through existing store actions plus a new `patchCompletionTargetId` action.

**Tech Stack:** React, Zustand, Radix UI (`Tooltip`, `Dialog`), Lucide (`TriangleAlert`), Vitest, Testing Library

---

## File Map

| File | Status | Responsibility |
|------|--------|---------------|
| `src/chores/healthCheck.ts` | Create | `detectChoreIssues`, `detectStaleTargets`, types |
| `src/chores/healthCheck.test.ts` | Create | Unit tests for detection functions |
| `src/hooks/useChoreIssues.ts` | Create | Hook: useMemo detection + silent fix effect |
| `src/components/chores/ChoreHealthTooltip.tsx` | Create | Warning icon + Radix Tooltip + dialog state |
| `src/components/chores/ChoreFixDialog.tsx` | Create | Fix dialog with per-row opt-out checkboxes |
| `src/components/chores/ChoreFixDialog.test.tsx` | Create | Integration test for opt-out checkbox behaviour |
| `src/store/index.ts` | Modify | Add `patchCompletionTargetId` action |
| `src/components/dashboard/ChoreCard.tsx` | Modify | Add `<ChoreHealthTooltip>` next to title |
| `src/components/chores/ChoreFormModal.tsx` | Modify | Add `<ChoreHealthTooltip>` in dialog header |

---

### Task 1: Add `patchCompletionTargetId` store action

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Add to the interface**

  In `src/store/index.ts`, add after `linkCompletionToTarget` on line 74:

  ```typescript
  patchCompletionTargetId: (completionId: string, targetId: string | undefined) => Promise<void>;
  ```

- [ ] **Step 2: Add the implementation**

  Inside `useAppStore = create<AppState>((set, get) => ({`, add after the `linkCompletionToTarget` implementation (search for `linkCompletionToTarget:` to find the right location):

  ```typescript
  patchCompletionTargetId: async (completionId, targetId) => {
    const { db, completions } = get();
    if (!db) throw new Error('DB not initialised');
    const completion = completions.find((c) => c.id === completionId);
    if (!completion) return;
    const { targetId: _old, ...rest } = completion;
    const updated: Completion = targetId !== undefined ? { ...rest, targetId } : rest;
    await putCompletion(db, updated);
    set((state) => ({
      completions: state.completions.map((c) => (c.id === completionId ? updated : c)),
    }));
    markDirty();
  },
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  bun run typecheck
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/store/index.ts
  git commit -m "feat(store): add patchCompletionTargetId action"
  ```

---

### Task 2: Detection functions + unit tests

**Files:**
- Create: `src/chores/healthCheck.ts`
- Create: `src/chores/healthCheck.test.ts`

- [ ] **Step 1: Write the failing tests first**

  Create `src/chores/healthCheck.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { detectChoreIssues, detectStaleTargets } from './healthCheck';
  import type { Target, Completion, Question } from '@/types';

  function makeTarget(id: string, answers: { questionId: string; value: string }[] = []): Target {
    return { id, choreKey: 'pack/chore', order: 0, answers };
  }

  function makeCompletion(
    id: string,
    answers: { questionId: string; value: string }[] = [],
    targetId?: string,
  ): Completion {
    return { id, choreKey: 'pack/chore', completedAt: '2024-01-01T00:00:00Z', xpEarned: 10, streak: 0, answers, ...(targetId ? { targetId } : {}) };
  }

  function makeQuestion(id: string): Question {
    return { id, choreKey: 'pack/chore', prompt: 'Q', required: false, order: 0, type: 'TEXT' };
  }

  describe('detectChoreIssues', () => {
    it('returns empty array when no issues', () => {
      const t = makeTarget('t1', [{ questionId: 'q1', value: 'a' }]);
      const c = makeCompletion('c1', [{ questionId: 'q1', value: 'a' }], 't1');
      const q = makeQuestion('q1');
      expect(detectChoreIssues([t], [c], [q])).toEqual([]);
    });

    it('detects duplicate targets — most-completed target is kept', () => {
      const t1 = makeTarget('t1', [{ questionId: 'q1', value: 'x' }]);
      const t2 = makeTarget('t2', [{ questionId: 'q1', value: 'x' }]);
      const c1 = makeCompletion('c1', [], 't1');
      const q = makeQuestion('q1');
      const issues = detectChoreIssues([t1, t2], [c1], [q]);
      expect(issues).toHaveLength(1);
      expect(issues[0].kind).toBe('duplicate-targets');
      if (issues[0].kind === 'duplicate-targets') {
        expect(issues[0].groups[0].keep.id).toBe('t1');
        expect(issues[0].groups[0].remove.map((t) => t.id)).toEqual(['t2']);
      }
    });

    it('detects duplicate targets — tie broken by id ascending', () => {
      const t1 = makeTarget('t1', [{ questionId: 'q1', value: 'x' }]);
      const t2 = makeTarget('t2', [{ questionId: 'q1', value: 'x' }]);
      const q = makeQuestion('q1');
      const issues = detectChoreIssues([t1, t2], [], [q]);
      expect(issues[0].kind).toBe('duplicate-targets');
      if (issues[0].kind === 'duplicate-targets') {
        expect(issues[0].groups[0].keep.id).toBe('t1');
      }
    });

    it('detects unmatched completion', () => {
      const t = makeTarget('t1', [{ questionId: 'q1', value: 'hello' }]);
      const c = makeCompletion('c1', [{ questionId: 'q1', value: 'hello' }]);
      const q = makeQuestion('q1');
      const issues = detectChoreIssues([t], [c], [q]);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toEqual({ kind: 'unmatched-completion', completionId: 'c1', targetId: 't1' });
    });

    it('does not flag completion that already has a targetId', () => {
      const t = makeTarget('t1', [{ questionId: 'q1', value: 'hello' }]);
      const c = makeCompletion('c1', [{ questionId: 'q1', value: 'hello' }], 't1');
      const q = makeQuestion('q1');
      expect(detectChoreIssues([t], [c], [q])).toEqual([]);
    });

    it('detects orphaned target ref', () => {
      const c = makeCompletion('c1', [], 'nonexistent');
      const issues = detectChoreIssues([], [c], []);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toEqual({ kind: 'orphaned-target-ref', completionId: 'c1' });
    });

    it('detects multiple issue kinds simultaneously', () => {
      const t1 = makeTarget('t1', [{ questionId: 'q1', value: 'a' }]);
      const t2 = makeTarget('t2', [{ questionId: 'q1', value: 'a' }]);
      const c1 = makeCompletion('c1', [], 'gone');
      const c2 = makeCompletion('c2', [{ questionId: 'q1', value: 'a' }]);
      const q = makeQuestion('q1');
      const issues = detectChoreIssues([t1, t2], [c1, c2], [q]);
      const kinds = issues.map((i) => i.kind).sort();
      expect(kinds).toEqual(['duplicate-targets', 'orphaned-target-ref', 'unmatched-completion'].sort());
    });

    it('excludes stale question refs from fingerprinting', () => {
      const t1 = makeTarget('t1', [{ questionId: 'q1', value: 'a' }, { questionId: 'deleted-q', value: 'old' }]);
      const t2 = makeTarget('t2', [{ questionId: 'q1', value: 'a' }]);
      const q = makeQuestion('q1');
      const issues = detectChoreIssues([t1, t2], [], [q]);
      expect(issues[0].kind).toBe('duplicate-targets');
    });
  });

  describe('detectStaleTargets', () => {
    it('returns empty when all answers reference known questions', () => {
      const t = makeTarget('t1', [{ questionId: 'q1', value: 'x' }]);
      const q = makeQuestion('q1');
      expect(detectStaleTargets([t], [q])).toEqual([]);
    });

    it('returns target when any answer references a deleted question', () => {
      const t = makeTarget('t1', [{ questionId: 'deleted-q', value: 'x' }]);
      expect(detectStaleTargets([t], [])).toEqual([t]);
    });

    it('returns target that has a mix of valid and stale answers', () => {
      const t = makeTarget('t1', [
        { questionId: 'q1', value: 'ok' },
        { questionId: 'deleted-q', value: 'old' },
      ]);
      const q = makeQuestion('q1');
      expect(detectStaleTargets([t], [q])).toEqual([t]);
    });
  });
  ```

- [ ] **Step 2: Run tests — verify they fail**

  ```bash
  bun test src/chores/healthCheck.test.ts
  ```

  Expected: `Cannot find module './healthCheck'`.

- [ ] **Step 3: Implement `src/chores/healthCheck.ts`**

  ```typescript
  import type { Target, Completion, Question, Answer } from '@/types';

  export interface DuplicateGroup {
    keep: Target;
    remove: Target[];
  }

  export type ChoreIssue =
    | { kind: 'duplicate-targets'; groups: DuplicateGroup[] }
    | { kind: 'unmatched-completion'; completionId: string; targetId: string }
    | { kind: 'orphaned-target-ref'; completionId: string };

  function fingerprint(answers: Answer[], questionIds: Set<string>): string {
    return [...answers]
      .filter((a) => questionIds.has(a.questionId))
      .sort((a, b) => a.questionId.localeCompare(b.questionId))
      .map((a) => `${a.questionId}:${JSON.stringify(a.value)}`)
      .join('|');
  }

  export function detectChoreIssues(
    targets: Target[],
    completions: Completion[],
    questions: Question[],
  ): ChoreIssue[] {
    const issues: ChoreIssue[] = [];
    const questionIds = new Set(questions.map((q) => q.id));
    const targetSet = new Set(targets.map((t) => t.id));

    // 1. Duplicate targets
    const fpToTargets = new Map<string, Target[]>();
    for (const t of targets) {
      const fp = fingerprint(t.answers, questionIds);
      const group = fpToTargets.get(fp) ?? [];
      group.push(t);
      fpToTargets.set(fp, group);
    }
    const duplicateGroups: DuplicateGroup[] = [];
    for (const group of fpToTargets.values()) {
      if (group.length < 2) continue;
      const counts = new Map(
        group.map((t) => [t.id, completions.filter((c) => c.targetId === t.id).length]),
      );
      const sorted = [...group].sort(
        (a, b) =>
          (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.id.localeCompare(b.id),
      );
      duplicateGroups.push({ keep: sorted[0], remove: sorted.slice(1) });
    }
    if (duplicateGroups.length > 0) issues.push({ kind: 'duplicate-targets', groups: duplicateGroups });

    // 2. Unmatched completions
    const targetFPs = new Map<string, string>();
    for (const t of targets) {
      const fp = fingerprint(t.answers, questionIds);
      if (!targetFPs.has(fp)) targetFPs.set(fp, t.id);
    }
    for (const c of completions) {
      if (c.targetId) continue;
      const fp = fingerprint(c.answers, questionIds);
      const matchedTargetId = targetFPs.get(fp);
      if (matchedTargetId) {
        issues.push({ kind: 'unmatched-completion', completionId: c.id, targetId: matchedTargetId });
      }
    }

    // 3. Orphaned refs
    for (const c of completions) {
      if (c.targetId && !targetSet.has(c.targetId)) {
        issues.push({ kind: 'orphaned-target-ref', completionId: c.id });
      }
    }

    return issues;
  }

  export function detectStaleTargets(targets: Target[], questions: Question[]): Target[] {
    const questionIds = new Set(questions.map((q) => q.id));
    return targets.filter((t) => t.answers.some((a) => !questionIds.has(a.questionId)));
  }
  ```

- [ ] **Step 4: Run tests — verify they pass**

  ```bash
  bun test src/chores/healthCheck.test.ts
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/chores/healthCheck.ts src/chores/healthCheck.test.ts
  git commit -m "feat(chores): add health check detection functions"
  ```

---

### Task 3: `useChoreIssues` hook

**Files:**
- Create: `src/hooks/useChoreIssues.ts`

- [ ] **Step 1: Create the hook**

  ```typescript
  import { useMemo, useEffect } from 'react';
  import { useShallow } from 'zustand/shallow';
  import { useAppStore } from '@/store';
  import type { DraftTarget } from '@/store';
  import { detectChoreIssues, detectStaleTargets } from '@/chores/healthCheck';
  import type { ChoreIssue } from '@/chores/healthCheck';

  export function useChoreIssues(choreKey: string): { issues: ChoreIssue[]; hasIssues: boolean } {
    const targets = useAppStore(useShallow((s) => s.targets.filter((t) => t.choreKey === choreKey)));
    const completions = useAppStore(useShallow((s) => s.completions.filter((c) => c.choreKey === choreKey)));
    const questions = useAppStore(useShallow((s) => s.questions.filter((q) => q.choreKey === choreKey)));
    const saveTargets = useAppStore((s) => s.saveTargets);

    const issues = useMemo(
      () => detectChoreIssues(targets, completions, questions),
      [targets, completions, questions],
    );

    const staleTargets = useMemo(
      () => detectStaleTargets(targets, questions),
      [targets, questions],
    );

    useEffect(() => {
      if (staleTargets.length === 0) return;
      const questionIds = new Set(questions.map((q) => q.id));
      const drafts: DraftTarget[] = targets.map((t) => ({
        id: t.id,
        order: t.order,
        answers: t.answers.filter((a) => questionIds.has(a.questionId)),
      }));
      void saveTargets(choreKey, drafts);
    }, [staleTargets]); // eslint-disable-line react-hooks/exhaustive-deps

    return { issues, hasIssues: issues.length > 0 };
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  bun run typecheck
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/hooks/useChoreIssues.ts
  git commit -m "feat(hooks): add useChoreIssues hook"
  ```

---

### Task 4: `ChoreFixDialog` component + test

**Files:**
- Create: `src/components/chores/ChoreFixDialog.tsx`
- Create: `src/components/chores/ChoreFixDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

  Create `src/components/chores/ChoreFixDialog.test.tsx`:

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { render, screen, fireEvent, waitFor } from '@testing-library/react';
  import ChoreFixDialog from './ChoreFixDialog';
  import type { ChoreIssue } from '@/chores/healthCheck';

  const mockLinkCompletionToTarget = vi.fn().mockResolvedValue(undefined);
  const mockPatchCompletionTargetId = vi.fn().mockResolvedValue(undefined);
  const mockSaveTargets = vi.fn().mockResolvedValue(undefined);

  vi.mock('@/store', () => ({
    useAppStore: (selector: (s: unknown) => unknown) =>
      selector({
        linkCompletionToTarget: mockLinkCompletionToTarget,
        patchCompletionTargetId: mockPatchCompletionTargetId,
        saveTargets: mockSaveTargets,
        completions: [],
        targets: [],
      }),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ChoreFixDialog', () => {
    it('calls linkCompletionToTarget when unmatched-completion fix is applied', async () => {
      const issues: ChoreIssue[] = [
        { kind: 'unmatched-completion', completionId: 'c1', targetId: 't1' },
      ];
      render(<ChoreFixDialog choreKey="pack/chore" issues={issues} onClose={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /apply fixes/i }));
      await waitFor(() => {
        expect(mockLinkCompletionToTarget).toHaveBeenCalledWith('c1', 't1');
      });
    });

    it('skips unchecked fix rows when applying', async () => {
      const issues: ChoreIssue[] = [
        { kind: 'unmatched-completion', completionId: 'c1', targetId: 't1' },
        { kind: 'orphaned-target-ref', completionId: 'c2' },
      ];
      render(<ChoreFixDialog choreKey="pack/chore" issues={issues} onClose={() => {}} />);

      // Uncheck the first fix
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      fireEvent.click(screen.getByRole('button', { name: /apply fixes/i }));
      await waitFor(() => {
        expect(mockLinkCompletionToTarget).not.toHaveBeenCalled();
        expect(mockPatchCompletionTargetId).toHaveBeenCalledWith('c2', undefined);
      });
    });
  });
  ```

- [ ] **Step 2: Run tests — verify they fail**

  ```bash
  bun test src/components/chores/ChoreFixDialog.test.tsx
  ```

  Expected: `Cannot find module './ChoreFixDialog'`.

- [ ] **Step 3: Implement `ChoreFixDialog.tsx`**

  ```tsx
  import { useState } from 'react';
  import { useShallow } from 'zustand/shallow';
  import { useAppStore } from '@/store';
  import type { DraftTarget } from '@/store';
  import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  } from '@/components/ui/dialog';
  import { Button } from '@/components/ui/button';
  import type { ChoreIssue, DuplicateGroup } from '@/chores/healthCheck';
  import type { Target, Completion } from '@/types';

  interface FixRow {
    key: string;
    label: string;
    apply: () => Promise<void>;
  }

  function summariseTarget(target: Target): string {
    if (target.answers.length === 0) return '(empty)';
    return target.answers.map((a) => String(a.value)).join(', ');
  }

  function summariseCompletion(completion: Completion): string {
    return new Date(completion.completedAt).toLocaleDateString();
  }

  interface Props {
    choreKey: string;
    issues: ChoreIssue[];
    onClose: () => void;
  }

  export default function ChoreFixDialog({ choreKey, issues, onClose }: Props) {
    const linkCompletionToTarget = useAppStore((s) => s.linkCompletionToTarget);
    const patchCompletionTargetId = useAppStore((s) => s.patchCompletionTargetId);
    const saveTargets = useAppStore((s) => s.saveTargets);
    const allCompletions = useAppStore(useShallow((s) => s.completions.filter((c) => c.choreKey === choreKey)));
    const allTargets = useAppStore(useShallow((s) => s.targets.filter((t) => t.choreKey === choreKey)));

    function buildRows(): FixRow[] {
      const rows: FixRow[] = [];
      for (const issue of issues) {
        if (issue.kind === 'duplicate-targets') {
          for (const group of issue.groups) {
            const removeCount = group.remove.length;
            const completionCount = allCompletions.filter((c) =>
              group.remove.some((t) => t.id === c.targetId),
            ).length;
            rows.push({
              key: `dup-${group.keep.id}`,
              label: `Merge ${removeCount} duplicate target${removeCount === 1 ? '' : 's'} into "${summariseTarget(group.keep)}"${completionCount > 0 ? ` (re-links ${completionCount} completion${completionCount === 1 ? '' : 's'})` : ''}`,
              apply: () => applyMergeDuplicates(group),
            });
          }
        } else if (issue.kind === 'unmatched-completion') {
          const completion = allCompletions.find((c) => c.id === issue.completionId);
          const target = allTargets.find((t) => t.id === issue.targetId);
          rows.push({
            key: `unmatched-${issue.completionId}`,
            label: `Link completion from ${completion ? summariseCompletion(completion) : issue.completionId} to target "${target ? summariseTarget(target) : issue.targetId}"`,
            apply: () => linkCompletionToTarget(issue.completionId, issue.targetId),
          });
        } else if (issue.kind === 'orphaned-target-ref') {
          const completion = allCompletions.find((c) => c.id === issue.completionId);
          rows.push({
            key: `orphan-${issue.completionId}`,
            label: `Remove broken target link from completion${completion ? ` from ${summariseCompletion(completion)}` : ''}`,
            apply: () => patchCompletionTargetId(issue.completionId, undefined),
          });
        }
      }
      return rows;
    }

    async function applyMergeDuplicates(group: DuplicateGroup): Promise<void> {
      const removeIds = new Set(group.remove.map((t) => t.id));
      for (const c of allCompletions) {
        if (c.targetId && removeIds.has(c.targetId)) {
          await patchCompletionTargetId(c.id, group.keep.id);
        }
      }
      const drafts: DraftTarget[] = allTargets.map((t) => ({
        id: t.id,
        order: t.order,
        answers: t.answers,
        _deleted: removeIds.has(t.id) ? true : undefined,
      }));
      await saveTargets(choreKey, drafts);
    }

    const rows = buildRows();
    const [checked, setChecked] = useState<Set<string>>(() => new Set(rows.map((r) => r.key)));
    const [loading, setLoading] = useState(false);

    function toggle(key: string) {
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
    }

    async function handleApply() {
      setLoading(true);
      try {
        for (const row of rows) {
          if (checked.has(row.key)) await row.apply();
        }
        onClose();
      } finally {
        setLoading(false);
      }
    }

    return (
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fix data issues</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {rows.map((row) => (
              <label key={row.key} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked.has(row.key)}
                  onChange={() => toggle(row.key)}
                  className="mt-0.5 h-4 w-4 rounded border-input accent-primary shrink-0"
                />
                <span className="text-sm">{row.label}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button onClick={handleApply} disabled={loading || checked.size === 0}>
              {loading ? 'Applying…' : 'Apply fixes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  ```

- [ ] **Step 4: Run tests — verify they pass**

  ```bash
  bun test src/components/chores/ChoreFixDialog.test.tsx
  ```

  Expected: all tests pass.

- [ ] **Step 5: Verify TypeScript compiles**

  ```bash
  bun run typecheck
  ```

  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/chores/ChoreFixDialog.tsx src/components/chores/ChoreFixDialog.test.tsx
  git commit -m "feat(chores): add ChoreFixDialog with per-row opt-out"
  ```

---

### Task 5: `ChoreHealthTooltip` component

**Files:**
- Create: `src/components/chores/ChoreHealthTooltip.tsx`

- [ ] **Step 1: Create the component**

  ```tsx
  import { useState } from 'react';
  import { TriangleAlert } from 'lucide-react';
  import {
    Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
  } from '@/components/ui/tooltip';
  import { Button } from '@/components/ui/button';
  import { useChoreIssues } from '@/hooks/useChoreIssues';
  import type { ChoreIssue } from '@/chores/healthCheck';
  import ChoreFixDialog from './ChoreFixDialog';

  function buildSummaryLines(issues: ChoreIssue[]): string[] {
    const lines: string[] = [];
    const dups = issues.find((i) => i.kind === 'duplicate-targets');
    if (dups && dups.kind === 'duplicate-targets') {
      const count = dups.groups.reduce((sum, g) => sum + g.remove.length, 0);
      lines.push(`${count} duplicate target${count === 1 ? '' : 's'}`);
    }
    const unmatchedCount = issues.filter((i) => i.kind === 'unmatched-completion').length;
    if (unmatchedCount > 0) lines.push(`${unmatchedCount} unmatched completion${unmatchedCount === 1 ? '' : 's'}`);
    const orphanCount = issues.filter((i) => i.kind === 'orphaned-target-ref').length;
    if (orphanCount > 0) lines.push(`${orphanCount} orphaned link${orphanCount === 1 ? '' : 's'}`);
    return lines;
  }

  interface Props {
    choreKey: string;
  }

  export default function ChoreHealthTooltip({ choreKey }: Props) {
    const { issues, hasIssues } = useChoreIssues(choreKey);
    const [fixOpen, setFixOpen] = useState(false);

    if (!hasIssues) return null;

    const summaryLines = buildSummaryLines(issues);

    return (
      <>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center text-amber-500 hover:text-amber-600 transition-colors"
                aria-label="Chore has data issues"
              >
                <TriangleAlert className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              className="bg-popover text-popover-foreground ring-1 ring-foreground/10 shadow-md p-3 space-y-2 max-w-56 text-left"
            >
              <p className="font-medium text-xs">Data issues found</p>
              <ul className="space-y-0.5">
                {summaryLines.map((line) => (
                  <li key={line} className="text-xs text-muted-foreground">{line}</li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="outline"
                className="w-full h-7 text-xs"
                onClick={() => setFixOpen(true)}
              >
                Fix issues
              </Button>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {fixOpen && (
          <ChoreFixDialog choreKey={choreKey} issues={issues} onClose={() => setFixOpen(false)} />
        )}
      </>
    );
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  bun run typecheck
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/chores/ChoreHealthTooltip.tsx
  git commit -m "feat(chores): add ChoreHealthTooltip with warning icon and fix dialog"
  ```

---

### Task 6: Wire `ChoreHealthTooltip` into `ChoreCard`

**Files:**
- Modify: `src/components/dashboard/ChoreCard.tsx`

- [ ] **Step 1: Add the import**

  Add to the imports in `src/components/dashboard/ChoreCard.tsx`:

  ```tsx
  import ChoreHealthTooltip from '@/components/chores/ChoreHealthTooltip';
  ```

- [ ] **Step 2: Insert the component next to the chore title**

  Find this block (lines 62–67):

  ```tsx
  <CardTitle className="text-sm leading-snug">
    <Link to={`/chores/${encodeURIComponent(chore.key)}`} className="hover:underline">
      {chore.title}
      {packTitle && <span className="ml-2 text-xs font-normal text-muted-foreground">{packTitle}</span>}
    </Link>
  </CardTitle>
  ```

  Replace with:

  ```tsx
  <CardTitle className="flex items-center gap-1.5 text-sm leading-snug">
    <Link to={`/chores/${encodeURIComponent(chore.key)}`} className="hover:underline">
      {chore.title}
      {packTitle && <span className="ml-2 text-xs font-normal text-muted-foreground">{packTitle}</span>}
    </Link>
    <ChoreHealthTooltip choreKey={chore.key} />
  </CardTitle>
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  bun run typecheck
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/dashboard/ChoreCard.tsx
  git commit -m "feat(dashboard): show ChoreHealthTooltip next to chore title in card"
  ```

---

### Task 7: Wire `ChoreHealthTooltip` into `ChoreFormModal`

**Files:**
- Modify: `src/components/chores/ChoreFormModal.tsx`

- [ ] **Step 1: Add the import**

  Add to the imports in `src/components/chores/ChoreFormModal.tsx`:

  ```tsx
  import ChoreHealthTooltip from './ChoreHealthTooltip';
  ```

- [ ] **Step 2: Insert the component in the dialog header**

  Find this block (around line 227):

  ```tsx
  <DialogHeader>
    <DialogTitle>{isEdit ? 'Edit Chore' : 'New Chore'}</DialogTitle>
  </DialogHeader>
  ```

  Replace with:

  ```tsx
  <DialogHeader>
    <DialogTitle className="flex items-center gap-2">
      {isEdit ? 'Edit Chore' : 'New Chore'}
      {isEdit && chore && <ChoreHealthTooltip choreKey={chore.key} />}
    </DialogTitle>
  </DialogHeader>
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  bun run typecheck
  ```

  Expected: no errors.

- [ ] **Step 4: Run full test suite**

  ```bash
  bun test
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/chores/ChoreFormModal.tsx
  git commit -m "feat(chores): show ChoreHealthTooltip in chore edit modal header"
  ```
