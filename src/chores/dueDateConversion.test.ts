import { describe, it, expect } from 'bun:test';
import {
  toFirstDueDate,
  firstDueDateToStartDate,
  formatDurationMs,
} from './dueDateConversion';
import type { Recurrence } from '@/types';

function rec(
  frequency: Recurrence['frequency'],
  interval: number,
  startDate: string,
  windowStartTime = '00:00',
): Recurrence {
  return { frequency, interval, startDate, windowStartTime };
}

describe('toFirstDueDate', () => {
  it('daily/1: first due date = startDate + 1 day', () => {
    expect(toFirstDueDate(rec('daily', 1, '2026-06-25'))).toBe('2026-06-26');
  });
  it('weekly/1: first due date = startDate + 7 days', () => {
    expect(toFirstDueDate(rec('weekly', 1, '2026-06-25'))).toBe('2026-07-02');
  });
  it('monthly/1: first due date = startDate + 1 month', () => {
    expect(toFirstDueDate(rec('monthly', 1, '2026-06-01'))).toBe('2026-07-01');
  });
  it('weekly/2: first due date = startDate + 14 days', () => {
    expect(toFirstDueDate(rec('weekly', 2, '2026-06-11'))).toBe('2026-06-25');
  });
});

describe('firstDueDateToStartDate', () => {
  it('daily/1: startDate = firstDueDate − 1 day', () => {
    expect(firstDueDateToStartDate('2026-06-26', 'daily', 1, '00:00')).toBe('2026-06-25');
  });
  it('weekly/1: startDate = firstDueDate − 7 days', () => {
    expect(firstDueDateToStartDate('2026-07-02', 'weekly', 1, '00:00')).toBe('2026-06-25');
  });
  it('round-trips correctly', () => {
    const original = '2026-06-25';
    const r = rec('weekly', 1, original);
    const firstDue = toFirstDueDate(r);
    const back = firstDueDateToStartDate(firstDue, 'weekly', 1, '00:00');
    expect(back).toBe(original);
  });
});

describe('formatDurationMs', () => {
  it('rounds to days when >= 1 day', () => {
    expect(formatDurationMs(7 * 86_400_000)).toBe('7 days');
    expect(formatDurationMs(1 * 86_400_000)).toBe('1 day');
  });
  it('rounds to hours when < 1 day', () => {
    expect(formatDurationMs(6 * 3_600_000)).toBe('6 hours');
    expect(formatDurationMs(1 * 3_600_000)).toBe('1 hour');
  });
  it('rounds to minutes when < 1 hour', () => {
    expect(formatDurationMs(30 * 60_000)).toBe('30 minutes');
    expect(formatDurationMs(60_000)).toBe('1 minute');
  });
});
