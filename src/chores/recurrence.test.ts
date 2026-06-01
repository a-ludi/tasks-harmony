import { describe, it, expect } from 'bun:test';
import {
  getWindowStart,
  getWindowEnd,
  getCurrentWindowIndex,
  getChoreStatus,
  formatRecurrence,
} from './recurrence';
import type { Recurrence, Chore, Completion, ChoreStatus } from '@/types';

// ── helpers ──────────────────────────────────────────────────────────────────

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

function makeCompletion(completedAt: string, streak = 1): Completion {
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

// ── getWindowStart ────────────────────────────────────────────────────────────

describe('getWindowStart', () => {
  it('index 0 daily/1 returns startDate at local midnight', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const result = getWindowStart(rec, 0);
    expect(result.getTime()).toBe(localMidnight('2026-01-10').getTime());
  });

  it('index 3 daily/1 returns startDate + 3 days', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const result = getWindowStart(rec, 3);
    expect(result.getTime()).toBe(localMidnight('2026-01-13').getTime());
  });

  it('index 1 weekly/2 returns startDate + 14 days', () => {
    const rec = makeRecurrence('weekly', 2, '2026-01-05');
    const result = getWindowStart(rec, 1);
    expect(result.getTime()).toBe(localMidnight('2026-01-19').getTime());
  });

  it('index 2 monthly/1 returns startDate + 2 months (proper date arithmetic)', () => {
    const rec = makeRecurrence('monthly', 1, '2026-01-31');
    const result = getWindowStart(rec, 2);
    // Jan 31 + 2 months = Mar 31
    expect(result.getTime()).toBe(localMidnight('2026-03-31').getTime());
  });

  it('windowStartTime 18:00 offsets window 0 to 18:00 on startDate', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10', '18:00');
    const expected = new Date(2026, 0, 10, 18, 0, 0, 0);
    expect(getWindowStart(rec, 0).getTime()).toBe(expected.getTime());
  });

  it('windowStartTime 18:00 means completion at 00:30 next day falls in window 0', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10', '18:00');
    // window 0: Jan 10 18:00 → Jan 11 18:00
    // Jan 11 00:30 is within that window
    const completionTime = new Date(2026, 0, 11, 0, 30, 0, 0);
    const windowStart = getWindowStart(rec, 0);
    const windowEnd = getWindowEnd(rec, 0);
    expect(completionTime.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
    expect(completionTime.getTime()).toBeLessThan(windowEnd.getTime());
  });
});

// ── getWindowEnd ──────────────────────────────────────────────────────────────

describe('getWindowEnd', () => {
  it('equals getWindowStart(index + 1)', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const end = getWindowEnd(rec, 2);
    const nextStart = getWindowStart(rec, 3);
    expect(end.getTime()).toBe(nextStart.getTime());
  });
});

// ── getCurrentWindowIndex ─────────────────────────────────────────────────────

describe('getCurrentWindowIndex', () => {
  it('returns null when now is before startDate', () => {
    const rec = makeRecurrence('daily', 1, '2026-06-01');
    const now = localMidnight('2026-05-31');
    expect(getCurrentWindowIndex(rec, now)).toBeNull();
  });

  it('returns 0 when now equals startDate (first window)', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const now = localMidnight('2026-01-10');
    expect(getCurrentWindowIndex(rec, now)).toBe(0);
  });

  it('returns 0 for now within first window but not yet at window 1', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const now = new Date(localMidnight('2026-01-10').getTime() + 23 * 3_600_000);
    expect(getCurrentWindowIndex(rec, now)).toBe(0);
  });

  it('returns 2 for now in the third window', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const now = localMidnight('2026-01-12');
    expect(getCurrentWindowIndex(rec, now)).toBe(2);
  });

  it('returns 2 for weekly/1 three weeks after startDate', () => {
    const rec = makeRecurrence('weekly', 1, '2026-01-05');
    const now = localMidnight('2026-01-19');
    expect(getCurrentWindowIndex(rec, now)).toBe(2);
  });

  it('returns 1 for daily/2 two days after startDate', () => {
    const rec = makeRecurrence('daily', 2, '2026-01-10');
    const now = localMidnight('2026-01-12');
    expect(getCurrentWindowIndex(rec, now)).toBe(1);
  });
});

// ── getChoreStatus ────────────────────────────────────────────────────────────

describe('getChoreStatus', () => {
  it('returns upcoming when startDate is in the future', () => {
    const rec = makeRecurrence('daily', 1, '2099-01-01');
    const chore = makeChore(rec);
    const now = new Date();
    expect(getChoreStatus(chore, [], now)).toBe('upcoming');
  });

  it('returns completed when there is a completion in the current window', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    // Window 0: 2026-01-10 00:00 – 2026-01-11 00:00
    const now = new Date(localMidnight('2026-01-10').getTime() + 3_600_000);
    const completedAt = new Date(localMidnight('2026-01-10').getTime() + 1_800_000).toISOString();
    const completions = [makeCompletion(completedAt)];
    expect(getChoreStatus(chore, completions, now)).toBe('completed');
  });

  it('returns overdue when previous window has no completion', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    // Now is window 1 (2026-01-11), window 0 (2026-01-10) has no completion
    const now = localMidnight('2026-01-11');
    expect(getChoreStatus(chore, [], now)).toBe('overdue');
  });

  it('returns due when no completion in current window but previous window was completed', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    // Now is window 1 (2026-01-11)
    const now = localMidnight('2026-01-11');
    // Completion in window 0
    const completedAt = new Date(localMidnight('2026-01-10').getTime() + 1_800_000).toISOString();
    const completions = [makeCompletion(completedAt)];
    expect(getChoreStatus(chore, completions, now)).toBe('due');
  });

  it('returns due in first window (index 0) with no completions', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    // Now is window 0 (startDate itself)
    const now = new Date(localMidnight('2026-01-10').getTime() + 3_600_000);
    expect(getChoreStatus(chore, [], now)).toBe('due');
  });

  it('returns upcoming (not throw) for malformed recurrence frequency', () => {
    const chore: Chore = {
      ...makeChore(makeRecurrence('daily', 1, '2026-01-10')),
      recurrence: { frequency: 'bogus' as Recurrence['frequency'], interval: 1, startDate: '2026-01-10', windowStartTime: '00:00' },
    };
    const now = localMidnight('2026-01-11');
    const result = getChoreStatus(chore, [], now);
    expect(result).toBe('upcoming');
  });
});

// ── formatRecurrence ──────────────────────────────────────────────────────────

describe('formatRecurrence', () => {
  it('interval=1 daily → "Daily"', () => {
    expect(formatRecurrence(makeRecurrence('daily', 1, '2026-01-01'))).toBe('Daily');
  });

  it('interval=1 weekly → "Weekly"', () => {
    expect(formatRecurrence(makeRecurrence('weekly', 1, '2026-01-01'))).toBe('Weekly');
  });

  it('interval=1 monthly → "Monthly"', () => {
    expect(formatRecurrence(makeRecurrence('monthly', 1, '2026-01-01'))).toBe('Monthly');
  });

  it('interval=3 daily → "Every 3 days"', () => {
    expect(formatRecurrence(makeRecurrence('daily', 3, '2026-01-01'))).toBe('Every 3 days');
  });

  it('interval=2 weekly → "Every 2 weeks"', () => {
    expect(formatRecurrence(makeRecurrence('weekly', 2, '2026-01-01'))).toBe('Every 2 weeks');
  });

  it('interval=6 monthly → "Every 6 months"', () => {
    expect(formatRecurrence(makeRecurrence('monthly', 6, '2026-01-01'))).toBe('Every 6 months');
  });

});

// ── Bug #4: hourly recurrence ─────────────────────────────────────────────────

describe('getWindowStart — hourly', () => {
  it('index 0 hourly/1 returns startDate at windowStartTime (top of start hour)', () => {
    const rec = makeRecurrence('hourly', 1, '2026-01-10', '09:00');
    const result = getWindowStart(rec, 0);
    const expected = new Date(2026, 0, 10, 9, 0, 0, 0);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('index 3 hourly/1 returns startDate + 3 hours', () => {
    const rec = makeRecurrence('hourly', 1, '2026-01-10', '09:00');
    const result = getWindowStart(rec, 3);
    const expected = new Date(2026, 0, 10, 12, 0, 0, 0);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('index 1 hourly/2 returns startDate + 2 hours (interval respected)', () => {
    const rec = makeRecurrence('hourly', 2, '2026-01-10', '08:00');
    const result = getWindowStart(rec, 1);
    const expected = new Date(2026, 0, 10, 10, 0, 0, 0);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('crosses midnight correctly', () => {
    const rec = makeRecurrence('hourly', 1, '2026-01-10', '23:00');
    const result = getWindowStart(rec, 2);
    const expected = new Date(2026, 0, 11, 1, 0, 0, 0); // Jan 11 01:00
    expect(result.getTime()).toBe(expected.getTime());
  });
});

describe('getCurrentWindowIndex — hourly', () => {
  it('returns 0 at the start of the first hour window', () => {
    const rec = makeRecurrence('hourly', 1, '2026-01-10', '09:00');
    const now = new Date(2026, 0, 10, 9, 0, 0, 0);
    expect(getCurrentWindowIndex(rec, now)).toBe(0);
  });

  it('returns 0 partway through the first hour window', () => {
    const rec = makeRecurrence('hourly', 1, '2026-01-10', '09:00');
    const now = new Date(2026, 0, 10, 9, 45, 0, 0);
    expect(getCurrentWindowIndex(rec, now)).toBe(0);
  });

  it('returns 3 three hours after start', () => {
    const rec = makeRecurrence('hourly', 1, '2026-01-10', '09:00');
    const now = new Date(2026, 0, 10, 12, 30, 0, 0);
    expect(getCurrentWindowIndex(rec, now)).toBe(3);
  });
});

describe('formatRecurrence — hourly', () => {
  it('interval=1 hourly → "Hourly"', () => {
    expect(formatRecurrence(makeRecurrence('hourly', 1, '2026-01-01'))).toBe('Hourly');
  });

  it('interval=4 hourly → "Every 4 hours"', () => {
    expect(formatRecurrence(makeRecurrence('hourly', 4, '2026-01-01'))).toBe('Every 4 hours');
  });
});

describe('getChoreStatus — hourly', () => {
  it('returns completed when there is a completion in the current hour window', () => {
    const rec = makeRecurrence('hourly', 1, '2026-01-10', '09:00');
    const chore = makeChore(rec);
    const now = new Date(2026, 0, 10, 9, 30, 0, 0);
    // completion at 9:15 — within window 0 (09:00–10:00)
    const completedAt = new Date(2026, 0, 10, 9, 15, 0, 0).toISOString();
    expect(getChoreStatus(chore, [makeCompletion(completedAt)], now)).toBe('completed');
  });

  it('returns due in first hour window with no completions', () => {
    const rec = makeRecurrence('hourly', 1, '2026-01-10', '09:00');
    const chore = makeChore(rec);
    const now = new Date(2026, 0, 10, 9, 30, 0, 0);
    expect(getChoreStatus(chore, [], now)).toBe('due');
  });
});

// ── Bug #7: malformed recurrence doesn't crash ────────────────────────────────

describe('getChoreStatus — malformed recurrence', () => {
  it('returns upcoming (not throw) when startDate is missing', () => {
    const chore: Chore = {
      ...makeChore(makeRecurrence('daily', 1, '2026-01-10')),
      recurrence: { frequency: 'daily', interval: 1, startDate: undefined as unknown as string, windowStartTime: '00:00' },
    };
    const now = localMidnight('2026-01-11');
    expect(getChoreStatus(chore, [], now)).toBe('upcoming');
  });

  it('returns upcoming (not throw) when startDate is empty string', () => {
    const chore: Chore = {
      ...makeChore(makeRecurrence('daily', 1, '2026-01-10')),
      recurrence: { frequency: 'daily', interval: 1, startDate: '', windowStartTime: '00:00' },
    };
    const now = localMidnight('2026-01-11');
    expect(getChoreStatus(chore, [], now)).toBe('upcoming');
  });

  it('returns upcoming (not throw) when frequency is missing', () => {
    const chore: Chore = {
      ...makeChore(makeRecurrence('daily', 1, '2026-01-10')),
      recurrence: { frequency: undefined as unknown as Recurrence['frequency'], interval: 1, startDate: '2026-01-10', windowStartTime: '00:00' },
    };
    const now = localMidnight('2026-01-11');
    expect(getChoreStatus(chore, [], now)).toBe('upcoming');
  });

  it('getWindowStart throws a descriptive error when startDate is missing', () => {
    const rec = { frequency: 'daily' as const, interval: 1, startDate: undefined as unknown as string, windowStartTime: '00:00' };
    expect(() => getWindowStart(rec, 0)).toThrow('malformed recurrence: missing startDate');
  });

  it('getWindowStart throws a descriptive error when frequency is missing', () => {
    const rec = { frequency: undefined as unknown as Recurrence['frequency'], interval: 1, startDate: '2026-01-10', windowStartTime: '00:00' };
    expect(() => getWindowStart(rec, 0)).toThrow('malformed recurrence: missing frequency');
  });
});
