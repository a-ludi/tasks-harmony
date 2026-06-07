import { describe, it, expect } from 'bun:test';
import { buildXPPreview, buildMultiplierXPPreview, toRepetitionFactor } from './xpPreview';
import type { XPSettings } from '@/types';

const SETTINGS_3X: XPSettings = {
  id: 'default', name: 'Default',
  maxStreakMultiplier: 3, decayFloor: 0.1, streakHalfLife: 7, decayHalfLife: 20,
};

const SETTINGS_1X: XPSettings = {
  id: 'flat', name: 'Flat',
  maxStreakMultiplier: 1, decayFloor: 0.1, streakHalfLife: 7, decayHalfLife: 20,
};

describe('buildXPPreview', () => {
  it('shows base and max XP when multiplier > 1', () => {
    // XP_BASE.M = 8; max = round(8 * 3) = 24
    expect(buildXPPreview('M', SETTINGS_3X)).toBe('8 XP · up to 24 XP at max streak');
  });

  it('shows only base XP when multiplier is 1', () => {
    // XP_BASE.M = 8; max = 8 — equal, so just one value
    expect(buildXPPreview('M', SETTINGS_1X)).toBe('8 XP');
  });

  it('scales correctly for different XP sizes', () => {
    // XP_BASE.S = 5; max = round(5 * 3) = 15
    expect(buildXPPreview('S', SETTINGS_3X)).toBe('5 XP · up to 15 XP at max streak');
  });

  it('handles fractional multiplier results by rounding', () => {
    const settings: XPSettings = { ...SETTINGS_3X, maxStreakMultiplier: 2.5 };
    // XP_BASE.XS = 3; max = round(3 * 2.5) = round(7.5) = 8
    expect(buildXPPreview('XS', settings)).toBe('3 XP · up to 8 XP at max streak');
  });
});

describe('buildMultiplierXPPreview', () => {
  it('shows ÷1 for repetition factor 1', () => {
    expect(buildMultiplierXPPreview(1)).toBe('÷1 per unit answered');
  });

  it('shows ÷2 for repetition factor 2', () => {
    expect(buildMultiplierXPPreview(2)).toBe('÷2 per unit answered');
  });

  it('shows ÷5 for repetition factor 5', () => {
    expect(buildMultiplierXPPreview(5)).toBe('÷5 per unit answered');
  });
});

describe('toRepetitionFactor', () => {
  it('returns 1 for xpPerUnit of 1', () => {
    expect(toRepetitionFactor(1)).toBe(1);
  });

  it('returns 2 for xpPerUnit of 0.5', () => {
    expect(toRepetitionFactor(0.5)).toBe(2);
  });

  it('returns 4 for xpPerUnit of 0.25', () => {
    expect(toRepetitionFactor(0.25)).toBe(4);
  });

  it('returns 1 for xpPerUnit >= 1 (legacy boost values clamp to 1)', () => {
    expect(toRepetitionFactor(2)).toBe(1);
    expect(toRepetitionFactor(1.5)).toBe(1);
  });

  it('returns 1 for xpPerUnit <= 0 or NaN (safe defaults)', () => {
    expect(toRepetitionFactor(0)).toBe(1);
    expect(toRepetitionFactor(-1)).toBe(1);
    expect(toRepetitionFactor(NaN)).toBe(1);
  });
});
