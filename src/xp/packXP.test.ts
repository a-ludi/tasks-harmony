import { describe, it, expect } from 'bun:test';
import { calculatePackXP } from './packXP';
import type { Chore, Completion } from '@/types';

const BASE_CHORE: Chore = {
  key: 'pack-a/chore-1', choreId: 'chore-1', packId: 'pack-a',
  title: 'C1', xpSize: 'S',
  recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
  repeatable: false, active: true, createdAt: '2026-01-01T00:00:00Z',
};

const CHORE_A1: Chore = { ...BASE_CHORE, key: 'pack-a/chore-1', choreId: 'chore-1', packId: 'pack-a' };
const CHORE_A2: Chore = { ...BASE_CHORE, key: 'pack-a/chore-2', choreId: 'chore-2', packId: 'pack-a' };
const CHORE_B1: Chore = { ...BASE_CHORE, key: 'pack-b/chore-1', choreId: 'chore-1', packId: 'pack-b' };

const COMP_A1: Completion = { id: 'c1', choreKey: 'pack-a/chore-1', completedAt: '2026-01-02T10:00:00Z', xpEarned: 10, streak: 1, answers: [] };
const COMP_A2: Completion = { id: 'c2', choreKey: 'pack-a/chore-2', completedAt: '2026-01-02T11:00:00Z', xpEarned: 5, streak: 1, answers: [] };
const COMP_B1: Completion = { id: 'c3', choreKey: 'pack-b/chore-1', completedAt: '2026-01-02T12:00:00Z', xpEarned: 20, streak: 1, answers: [] };

describe('calculatePackXP', () => {
  it('sums XP for all completions of chores in the given pack', () => {
    expect(calculatePackXP('pack-a', [CHORE_A1, CHORE_A2, CHORE_B1], [COMP_A1, COMP_A2, COMP_B1])).toBe(15);
  });

  it('excludes completions from other packs', () => {
    expect(calculatePackXP('pack-b', [CHORE_A1, CHORE_B1], [COMP_A1, COMP_B1])).toBe(20);
  });

  it('returns 0 when the pack has no completions', () => {
    expect(calculatePackXP('pack-a', [CHORE_A1], [])).toBe(0);
  });

  it('returns 0 when chores list is empty', () => {
    expect(calculatePackXP('pack-a', [], [COMP_A1])).toBe(0);
  });
});
