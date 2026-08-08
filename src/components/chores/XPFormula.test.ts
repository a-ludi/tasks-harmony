import { describe, it, expect } from 'bun:test';
import { showsRounding, formatStreakRange } from './XPFormula';

describe('showsRounding', () => {
  it('returns false when no multiplier, streak off, decay off', () => {
    expect(showsRounding(undefined, false, false)).toBe(false);
  });

  it('returns true when streak is enabled', () => {
    expect(showsRounding(undefined, true, false)).toBe(true);
  });

  it('returns true when decay is enabled', () => {
    expect(showsRounding(undefined, false, true)).toBe(true);
  });

  it('returns true when multiplier is present', () => {
    expect(showsRounding({ xpPerUnit: 10 }, false, false)).toBe(true);
  });

  it('returns true when all multipliers are active', () => {
    expect(showsRounding({ xpPerUnit: 5 }, true, true)).toBe(true);
  });
});

describe('formatStreakRange', () => {
  it('formats 1.0 as 100%–100%', () => {
    expect(formatStreakRange(1.0)).toBe('100%–100%');
  });

  it('formats 1.5 as 100%–150%', () => {
    expect(formatStreakRange(1.5)).toBe('100%–150%');
  });

  it('formats 2.5 as 100%–250%', () => {
    expect(formatStreakRange(2.5)).toBe('100%–250%');
  });
});
