import { describe, it, expect } from 'bun:test';
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
    const kinds = [...issues.map((i) => i.kind)].sort() as Array<'duplicate-targets' | 'orphaned-target-ref' | 'unmatched-completion'>;
    expect(kinds.length).toBe(3);
    expect(kinds).toContain('duplicate-targets');
    expect(kinds).toContain('orphaned-target-ref');
    expect(kinds).toContain('unmatched-completion');
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
