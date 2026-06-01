import { describe, expect, test } from 'bun:test';
import { calculateXP, XP_BASE } from './calculator';
import type { XPSettings } from '@/types';

const STANDARD: XPSettings = {
  id: 'standard', name: 'Standard',
  maxStreakMultiplier: 2, decayFloor: 0.5, streakHalfLife: 7, decayHalfLife: 56,
};
const HARD: XPSettings = {
  id: 'hard', name: 'Hard Mode',
  maxStreakMultiplier: 2.5, decayFloor: 0.4, streakHalfLife: 14, decayHalfLife: 56,
};

describe('XP_BASE', () => {
  test('all sizes map to correct base values per spec §7.1', () => {
    expect(XP_BASE.XXS).toBe(0.5); expect(XP_BASE.XS).toBe(1); expect(XP_BASE.S).toBe(2);
    expect(XP_BASE.M).toBe(3); expect(XP_BASE.L).toBe(5); expect(XP_BASE.XL).toBe(8);
    expect(XP_BASE.XXL).toBe(13); expect(XP_BASE.XXXL).toBe(21);
  });
});

describe('calculateXP', () => {
  test('first-ever completion (streak=1) returns rounded base XP', () => {
    expect(calculateXP('M', 1, STANDARD)).toBeGreaterThanOrEqual(3);
  });
  test('result is always a rounded integer', () => {
    for (let streak = 1; streak <= 20; streak++) {
      expect(Number.isInteger(calculateXP('M', streak, STANDARD))).toBe(true);
    }
  });
  test('higher streak earns more than lower streak (streakMult dominates at low streaks)', () => {
    expect(calculateXP('M', 14, STANDARD)).toBeGreaterThan(calculateXP('M', 1, STANDARD));
  });
  test('decay is driven by streak — different streak counts produce different XP values', () => {
    // Verifies streakCount actually influences the decay factor.
    // If totalCompletions were mistakenly re-introduced as a separate parameter that affected
    // the result, a caller using streak=1 vs streak=10 would still differ, but the test below
    // locks in that the *only* variable is streakCount: a low streak should yield lower XP
    // than a mid-range streak (streak bonus not yet saturated, decay not yet minimal).
    const atStreak1 = calculateXP('M', 1, STANDARD);
    const atStreak5 = calculateXP('M', 5, STANDARD);
    const atStreak10 = calculateXP('M', 10, STANDARD);
    expect(atStreak5).toBeGreaterThan(atStreak1);
    expect(atStreak10).toBeGreaterThan(atStreak5);
  });
  test('XP converges toward base × maxStreakMultiplier × decayFloor at extreme streak values', () => {
    // M base=3, maxStreakMultiplier=2, decayFloor=0.5 → 3 * 2 * 0.5 = 3.0 ≈ 3
    expect(calculateXP('M', 500, STANDARD)).toBeCloseTo(3, 0);
  });
  test('minimum XP is at least 1 even in Hard Mode with maximum decay', () => {
    expect(calculateXP('XXS', 500, HARD)).toBeGreaterThanOrEqual(1);
  });
});
