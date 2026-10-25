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
