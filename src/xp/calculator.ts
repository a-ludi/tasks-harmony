import type { XPSettings, XPSize } from '@/types';

export const XP_BASE: Record<XPSize, number> = {
  XXS: 2, XS: 3, S: 5, M: 8, L: 13, XL: 21, XXL: 34, XXXL: 55,
};

export function getXPBase(xpSize: XPSize | number): number {
  return typeof xpSize === 'number' ? xpSize : XP_BASE[xpSize];
}

export function calculateXP(
  xpSize: XPSize | number,
  streakCount: number,
  totalCompletions: number,
  settings: XPSettings,
): number {
  const base = getXPBase(xpSize);
  const { maxStreakMultiplier, decayFloor, streakHalfLife, decayHalfLife } = settings;
  const streakMult = maxStreakMultiplier
    - (maxStreakMultiplier - 1) * Math.exp(-Math.LN2 / streakHalfLife * streakCount);
  const decayMult = decayFloor
    + (1 - decayFloor) * Math.exp(-Math.LN2 / decayHalfLife * totalCompletions);
  return Math.round(base * streakMult * decayMult);
}
