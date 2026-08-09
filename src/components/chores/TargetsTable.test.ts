import { describe, it, expect } from 'bun:test';
import { filterAndSortTargets, getTargetCompletedAt, isTargetDone } from './TargetsTable';
import type { Target, Completion } from '@/types';

const t1: Target = { id: 't1', choreKey: 'p/c', order: 0, answers: [{ questionId: 'q1', value: 'Berlin' }] };
const t2: Target = { id: 't2', choreKey: 'p/c', order: 1, answers: [{ questionId: 'q1', value: 'Paris' }] };
const done: Completion = { id: 'c1', choreKey: 'p/c', completedAt: '2026-01-01T10:00:00Z', xpEarned: 10, streak: 1, answers: [], targetId: 't1' };

describe('isTargetDone', () => {
  it('returns true when a completion links to the target', () => {
    expect(isTargetDone(t1, [done])).toBe(true);
  });
  it('returns false when no completion links to the target', () => {
    expect(isTargetDone(t2, [done])).toBe(false);
  });
});

describe('getTargetCompletedAt', () => {
  it('returns the earliest linked completion timestamp', () => {
    const c2: Completion = { ...done, id: 'c2', completedAt: '2026-01-02T10:00:00Z' };
    expect(getTargetCompletedAt(t1, [done, c2])).toBe('2026-01-01T10:00:00Z');
  });
  it('returns null for a pending target', () => {
    expect(getTargetCompletedAt(t2, [done])).toBeNull();
  });
});

describe('filterAndSortTargets', () => {
  it('hides done targets when showCompleted is false', () => {
    const result = filterAndSortTargets([t1, t2], [done], [], false);
    expect(result.map(r => r.target.id)).toEqual(['t2']);
  });
  it('shows done targets when showCompleted is true', () => {
    const result = filterAndSortTargets([t1, t2], [done], [], true);
    expect(result.map(r => r.target.id)).toContain('t1');
  });
  it('sorts by question answer ascending', () => {
    const sorts = [{ key: 'question:q1' as const, dir: 'asc' as const }];
    const result = filterAndSortTargets([t2, t1], [], sorts, true);
    expect(result[0].target.id).toBe('t1'); // Berlin < Paris
  });
});
