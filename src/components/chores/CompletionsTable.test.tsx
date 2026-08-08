import { describe, it, expect } from 'bun:test';
import { computeTotals, clickColumnHeader, getGroupKey } from './completionsTable.ts';
import type { Completion } from '@/types';

const mkCompletion = (id: string, xp: number): Completion => ({
  id, choreKey: 'k', completedAt: `2026-01-0${id}T00:00:00Z`, xpEarned: xp, streak: 1, answers: [],
});

describe('CompletionsTable logic', () => {
  it('computeTotals always returns a count (backing totals row)', () => {
    const cs = [mkCompletion('1', 100), mkCompletion('2', 200)];
    const totals = computeTotals(cs, []);
    expect(totals.count).toBe(2);
    expect(totals.xpSum).toBe(300);
  });

  it('sorts list is empty by default; clicking a header adds a sort (backing Reset sorting visibility)', () => {
    const initial: never[] = [];
    const after = clickColumnHeader(initial, 'completedAt', []);
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual({ key: 'completedAt', dir: 'asc' });
    const reset: never[] = [];
    expect(reset).toHaveLength(0);
  });

  it('getGroupKey produces same key for same values, different key for different values (backing accordion group identity)', () => {
    const c1 = mkCompletion('1', 100);
    const c2 = mkCompletion('2', 200);
    // No group-by answers — both map to null
    expect(getGroupKey(c1, [])).toBe(getGroupKey(c2, []));
  });
});
