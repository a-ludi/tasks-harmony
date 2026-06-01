import { describe, it, expect } from 'bun:test';
import { computeNewStreak } from './streak';
import type { Chore, Completion, Recurrence } from '@/types';

function makeRecurrence(
  frequency: Recurrence['frequency'],
  interval: number,
  startDate: string,
  windowStartTime = '00:00',
): Recurrence {
  return { frequency, interval, startDate, windowStartTime };
}

function makeChore(recurrence: Recurrence): Chore {
  return {
    key: 'personal/test-chore',
    choreId: 'test-chore',
    packId: 'personal',
    title: 'Test Chore',
    xpSize: 'S',
    recurrence,
    repeatable: false,
    active: true,
    createdAt: recurrence.startDate + 'T00:00:00.000Z',
  };
}

function makeCompletion(completedAt: string, streak: number): Completion {
  return {
    id: crypto.randomUUID(),
    choreKey: 'personal/test-chore',
    completedAt,
    xpEarned: 10,
    streak,
    answers: [],
  };
}

function localMidnight(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

describe('computeNewStreak', () => {
  it('returns 1 when there are no previous completions', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    const now = localMidnight('2026-01-10');
    expect(computeNewStreak(chore, [], now)).toBe(1);
  });

  it('returns lastCompletion.streak + 1 when last completion was in the immediately preceding window', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    // Now = window 1 (2026-01-11). Previous window = window 0 (2026-01-10).
    const now = localMidnight('2026-01-11');
    // Completion in window 0
    const completedAt = new Date(localMidnight('2026-01-10').getTime() + 3_600_000).toISOString();
    const completions = [makeCompletion(completedAt, 3)];
    expect(computeNewStreak(chore, completions, now)).toBe(4);
  });

  it('returns 1 when last completion was two windows ago (streak broken)', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    // Now = window 2 (2026-01-12). Previous window = window 1 (2026-01-11).
    // Last completion was in window 0 (2026-01-10) — two windows ago.
    const now = localMidnight('2026-01-12');
    const completedAt = new Date(localMidnight('2026-01-10').getTime() + 3_600_000).toISOString();
    const completions = [makeCompletion(completedAt, 5)];
    expect(computeNewStreak(chore, completions, now)).toBe(1);
  });

  it('returns 1 when currentIdx is 0 (first window, no prior window to check)', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    const now = localMidnight('2026-01-10');
    // Even if there are completions (shouldn't normally happen), streak resets
    const completedAt = new Date(localMidnight('2026-01-10').getTime() + 100).toISOString();
    const completions = [makeCompletion(completedAt, 99)];
    expect(computeNewStreak(chore, completions, now)).toBe(1);
  });

  it('handles multiple previous completions and picks the most recent', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    // Now = window 2 (2026-01-12). Previous window = window 1 (2026-01-11).
    const now = localMidnight('2026-01-12');
    // Two completions: one old (window 0) with streak 1, one recent (window 1) with streak 2
    const oldCompletion = makeCompletion(
      new Date(localMidnight('2026-01-10').getTime() + 3_600_000).toISOString(),
      1,
    );
    const recentCompletion = makeCompletion(
      new Date(localMidnight('2026-01-11').getTime() + 3_600_000).toISOString(),
      2,
    );
    expect(computeNewStreak(chore, [oldCompletion, recentCompletion], now)).toBe(3);
  });

  it('works for weekly recurrence streak continuation', () => {
    const rec = makeRecurrence('weekly', 1, '2026-01-05');
    const chore = makeChore(rec);
    // Now = window 1 start (2026-01-12). Previous window = window 0 (2026-01-05).
    const now = localMidnight('2026-01-12');
    const completedAt = new Date(localMidnight('2026-01-07').getTime()).toISOString();
    const completions = [makeCompletion(completedAt, 2)];
    expect(computeNewStreak(chore, completions, now)).toBe(3);
  });

  it('returns 1 when now is before startDate (currentIdx === null)', () => {
    const rec = makeRecurrence('daily', 1, '2099-01-01');
    const chore = makeChore(rec);
    const now = localMidnight('2026-01-10');
    const completions = [makeCompletion(new Date(localMidnight('2026-01-09').getTime()).toISOString(), 5)];
    expect(computeNewStreak(chore, completions, now)).toBe(1);
  });
});
