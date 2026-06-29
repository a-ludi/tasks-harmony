import { describe, expect, test } from 'bun:test';
import { calculateXP, XP_BASE, getXPBase } from './calculator';
import type { XPSettings } from '@/types';

const STANDARD: XPSettings = {
  id: 'standard', name: 'Standard',
  maxStreakMultiplier: 2.5, decayFloor: 0.6, streakHalfLife: 7, decayHalfLife: 56,
};
const HARD: XPSettings = {
  id: 'hard', name: 'Hard Mode',
  maxStreakMultiplier: 2.5, decayFloor: 0.4, streakHalfLife: 14, decayHalfLife: 56,
};

describe('XP_BASE', () => {
  test('all sizes map to correct base values', () => {
    expect(XP_BASE.XXS).toBe(2); expect(XP_BASE.XS).toBe(3); expect(XP_BASE.S).toBe(5);
    expect(XP_BASE.M).toBe(8); expect(XP_BASE.L).toBe(13); expect(XP_BASE.XL).toBe(21);
    expect(XP_BASE.XXL).toBe(34); expect(XP_BASE.XXXL).toBe(55);
  });
});

describe('getXPBase', () => {
  test('returns XP_BASE value for named size', () => {
    expect(getXPBase('M')).toBe(8);
    expect(getXPBase('XXS')).toBe(2);
    expect(getXPBase('XXXL')).toBe(55);
  });
  test('returns the number itself for a custom numeric size', () => {
    expect(getXPBase(10)).toBe(10);
    expect(getXPBase(100)).toBe(100);
  });
});

describe('calculateXP', () => {
  test('first-ever completion (streak=1, totalCompletions=0) returns rounded base XP', () => {
    expect(calculateXP('M', 1, 0, STANDARD)).toBeGreaterThanOrEqual(8);
  });
  test('result is always a rounded integer', () => {
    for (let streak = 1; streak <= 20; streak++) {
      expect(Number.isInteger(calculateXP('M', streak, streak - 1, STANDARD))).toBe(true);
    }
  });
  test('higher streak earns more than lower streak (same totalCompletions)', () => {
    expect(calculateXP('M', 14, 10, STANDARD)).toBeGreaterThan(calculateXP('M', 1, 10, STANDARD));
  });
  test('more totalCompletions reduces XP (same streak)', () => {
    expect(calculateXP('M', 5, 0, STANDARD)).toBeGreaterThan(calculateXP('M', 5, 200, STANDARD));
  });
  test('XP converges toward base × maxStreakMultiplier × decayFloor at extreme values', () => {
    expect(calculateXP('M', 500, 500, STANDARD)).toBeCloseTo(12, 0);
  });
  test('experienced user breaking streak earns below base in Hard Mode', () => {
    expect(calculateXP('M', 1, 200, HARD)).toBeLessThan(XP_BASE.M);
  });
  test('minimum XP is at least 1 even in Hard Mode with maximum decay', () => {
    expect(calculateXP('XXS', 1, 500, HARD)).toBeGreaterThanOrEqual(1);
  });
});
