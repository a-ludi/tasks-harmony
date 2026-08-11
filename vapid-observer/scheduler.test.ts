import { describe, it, expect } from 'bun:test';
import { computeNextNotificationAt } from './scheduler';

const dailyRec = { frequency: 'daily' as const, interval: 1, startDate: '2026-01-01', windowStartTime: '09:00' };

describe('computeNextNotificationAt', () => {
  it('returns first window start when never delivered', () => {
    const result = computeNextNotificationAt(dailyRec, undefined, 'at-due-time', null);
    // Should be a future date at 09:00 UTC
    const d = new Date(result);
    expect(d.getUTCHours()).toBe(9);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d > new Date()).toBe(true);
  });

  it('advances to next window after lastDeliveredAt', () => {
    const lastDeliveredAt = '2030-08-10T09:00:00Z';
    const result = computeNextNotificationAt(dailyRec, undefined, 'at-due-time', lastDeliveredAt);
    expect(result).toBe('2030-08-11T09:00:00.000Z');
  });

  it('applies duePeriod offset (2 hours before window end)', () => {
    const duePeriod = { value: 2, unit: 'hours' as const };
    const lastDeliveredAt = '2030-08-10T09:00:00Z';
    const result = computeNextNotificationAt(dailyRec, duePeriod, 'at-due-time', lastDeliveredAt);
    // Window: 2030-08-11T09:00Z → 2030-08-12T09:00Z; notify at 2030-08-12T07:00Z
    expect(result).toBe('2030-08-12T07:00:00.000Z');
  });

  it('handles weekly recurrence', () => {
    const weeklyRec = { frequency: 'weekly' as const, interval: 1, startDate: '2026-01-05', windowStartTime: '10:00' };
    // lastDeliveredAt is on a weekly boundary (aligned with startDate) so the next window is exactly 7 days later
    const lastDeliveredAt = '2030-08-05T10:00:00Z';
    const result = computeNextNotificationAt(weeklyRec, undefined, 'at-due-time', lastDeliveredAt);
    const d = new Date(result);
    expect(d.getUTCHours()).toBe(10);
    // 7 days later
    const last = new Date(lastDeliveredAt);
    expect(d.getTime() - last.getTime()).toBe(7 * 86_400_000);
  });
});
