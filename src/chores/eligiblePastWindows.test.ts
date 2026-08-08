import { describe, it, expect } from 'bun:test';
import { eligiblePastWindows } from './eligiblePastWindows';
import type { Chore, Completion } from '@/types';

function makeChore(repeatable = false): Chore {
  return {
    key: 'personal/test', choreId: 'test', packId: 'personal',
    title: 'Test', xpSize: 'S',
    recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
    repeatable,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeCompletion(completedAt: string): Completion {
  return { id: crypto.randomUUID(), choreKey: 'personal/test', completedAt, xpEarned: 5, streak: 1, answers: [] };
}

describe('eligiblePastWindows', () => {
  it('returns empty when no past windows exist (started today)', () => {
    const now = new Date('2026-01-01T12:00:00');
    const result = eligiblePastWindows(makeChore(), [], now);
    expect(result).toHaveLength(0);
  });

  it('returns all closed windows when no completions exist', () => {
    const now = new Date('2026-01-04T12:00:00'); // day 4; windows 0,1,2 are closed
    const result = eligiblePastWindows(makeChore(), [], now);
    expect(result).toHaveLength(3);
    expect(result[0].index).toBe(0);
    expect(result[2].index).toBe(2);
  });

  it('returns only windows after the last completion window', () => {
    const now = new Date('2026-01-05T12:00:00'); // windows 0-3 closed
    const completions = [makeCompletion('2026-01-02T10:00:00')]; // in window index 1
    const result = eligiblePastWindows(makeChore(), completions, now);
    // eligible: indices 2, 3 only
    expect(result.map(w => w.index)).toEqual([2, 3]);
  });

  it('returns empty when last completion is in the window immediately before current', () => {
    const now = new Date('2026-01-03T12:00:00'); // current = window 2
    const completions = [makeCompletion('2026-01-02T10:00:00')]; // in window 1 (immediately before)
    const result = eligiblePastWindows(makeChore(), completions, now);
    expect(result).toHaveLength(0);
  });

  it('excludes already-completed windows for non-repeatable chores (safety guard)', () => {
    const chore = makeChore(false);
    const now = new Date('2026-01-05T12:00:00');
    const completions = [
      makeCompletion('2026-01-01T10:00:00'), // window 0
      makeCompletion('2026-01-03T10:00:00'), // window 2
    ];
    const result = eligiblePastWindows(chore, completions, now);
    // last completion is window 2; eligible = window 3 only
    expect(result.map(w => w.index)).toEqual([3]);
  });

  it('does not exclude completed windows for repeatable chores', () => {
    const chore = makeChore(true); // repeatable
    const now = new Date('2026-01-05T12:00:00');
    const completions = [makeCompletion('2026-01-01T10:00:00')]; // window 0
    const result = eligiblePastWindows(chore, completions, now);
    // all windows 0,1,2,3 eligible for repeatable chores
    expect(result.map(w => w.index)).toEqual([0, 1, 2, 3]);
  });

  it('includes windows before the last completion for repeatable chores', () => {
    const chore = makeChore(true); // repeatable
    const now = new Date('2026-01-05T12:00:00'); // windows 0-3 closed
    const completions = [makeCompletion('2026-01-03T10:00:00')]; // completion in window 2
    const result = eligiblePastWindows(chore, completions, now);
    // windows 0, 1, 2, 3 all eligible — last completion index does not restrict earlier windows
    expect(result.map(w => w.index)).toEqual([0, 1, 2, 3]);
  });

  it('window start and end are correct', () => {
    const now = new Date('2026-01-03T12:00:00');
    const result = eligiblePastWindows(makeChore(), [], now);
    // window 0: Jan 1 00:00 → Jan 2 00:00
    expect(result[0].start.toDateString()).toBe(new Date(2026, 0, 1).toDateString());
    expect(result[0].end.toDateString()).toBe(new Date(2026, 0, 2).toDateString());
  });
});
