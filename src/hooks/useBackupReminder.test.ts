import { describe, it, expect } from 'bun:test';
import { computeIsDue } from './useBackupReminder';

function isoHoursAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 60 * 1000).toISOString();
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe('computeIsDue', () => {
  it('is due when no prior action, daily', () => {
    expect(computeIsDue('daily', null, null)).toBe(true);
  });

  it('is due when no prior action, weekly', () => {
    expect(computeIsDue('weekly', null, null)).toBe(true);
  });

  it('is never due when frequency is never', () => {
    expect(computeIsDue('never', null, null)).toBe(false);
    expect(computeIsDue('never', isoDaysAgo(100), isoDaysAgo(100))).toBe(false);
  });

  it('is not due when dismissed 1 hour ago, daily', () => {
    expect(computeIsDue('daily', null, isoHoursAgo(1))).toBe(false);
  });

  it('is due when dismissed 25 hours ago, daily', () => {
    expect(computeIsDue('daily', null, isoDaysAgo(2))).toBe(true);
  });

  it('is not due when backed up 1 hour ago, daily', () => {
    expect(computeIsDue('daily', isoHoursAgo(1), null)).toBe(false);
  });

  it('uses the more recent of lastBackedUpAt and dismissedAt', () => {
    // dismissed 1h ago (recent), backed up 10 days ago (old) → not due
    expect(computeIsDue('daily', isoDaysAgo(10), isoHoursAgo(1))).toBe(false);
  });

  it('is not due when dismissed 5 days ago, weekly', () => {
    expect(computeIsDue('weekly', null, isoDaysAgo(5))).toBe(false);
  });

  it('is due when dismissed 8 days ago, weekly', () => {
    expect(computeIsDue('weekly', null, isoDaysAgo(8))).toBe(true);
  });

  it('is not due when dismissed 25 days ago, monthly', () => {
    expect(computeIsDue('monthly', null, isoDaysAgo(25))).toBe(false);
  });

  it('is due when dismissed 31 days ago, monthly', () => {
    expect(computeIsDue('monthly', null, isoDaysAgo(31))).toBe(true);
  });
});
