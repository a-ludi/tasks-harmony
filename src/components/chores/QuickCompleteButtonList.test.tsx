import { describe, it, expect } from 'bun:test';
import { getChoreStatus } from '@/chores/recurrence';
import type { Chore, Completion, QuickAnswerSet } from '@/types';

// Tests for the visibility logic used by QuickCompleteButtonList:
// - renders nothing when no quick answer sets
// - renders nothing when status is upcoming
// - renders buttons when status is due and sets exist

const chore: Chore = {
  key: 'pack/chore', choreId: 'chore', packId: 'pack', title: 'Test',
  xpSize: 'M', repeatable: false, active: true, createdAt: '2026-01-01T00:00:00Z',
  recurrence: { frequency: 'daily', interval: 1, startDate: '2020-01-01', windowStartTime: '00:00' },
};

function isActionable(chore: Chore, completions: Completion[], sets: QuickAnswerSet[]): boolean {
  if (sets.length === 0) return false;
  const status = getChoreStatus(chore, completions, new Date());
  return status === 'due' || status === 'overdue' || (status === 'completed' && chore.repeatable);
}

describe('QuickCompleteButtonList visibility logic', () => {
  it('renders nothing when no quick answer sets', () => {
    const sets: QuickAnswerSet[] = [];
    expect(isActionable(chore, [], sets)).toBe(false);
  });

  it('renders nothing when status is upcoming (future start date)', () => {
    const sets: QuickAnswerSet[] = [{ id: 'qs1', choreKey: chore.key, label: 'Quick', answers: [] }];
    const upcomingChore = { ...chore, recurrence: { ...chore.recurrence, startDate: '2099-01-01' } };
    expect(isActionable(upcomingChore, [], sets)).toBe(false);
  });

  it('renders buttons when status is due and sets exist', () => {
    const sets: QuickAnswerSet[] = [{ id: 'qs1', choreKey: chore.key, label: 'Quick', answers: [] }];
    // chore started 2020-01-01, so it is long overdue/due — definitely actionable
    expect(isActionable(chore, [], sets)).toBe(true);
  });
});
