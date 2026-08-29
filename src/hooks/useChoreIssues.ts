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
