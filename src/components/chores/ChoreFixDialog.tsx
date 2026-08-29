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
